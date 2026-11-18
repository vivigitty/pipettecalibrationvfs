import { calibrationDates } from '@/domain/dates';
import { parseRange, planLots } from '@/domain/range';
import { combineStatuses, compareLimit, statistics, toVolumeUl } from '@/domain/statistics';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/lib/errors';
import { authorizeWrite, type Actor } from '@/lib/rbac';
import { recordAudit, recordAudits, type AuditEntry } from '@/repositories/audit';
import { lockAsset, lockSession, sessionDetail } from '@/repositories/calibration';
import { transaction } from '@/repositories/inventory';
import { damageSchema, readingsSchema, startSessionSchema } from '@/schemas/resources';

export async function startSession(actor: Actor, assetId: string, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const input = startSessionSchema.parse(raw);
  return transaction(async (tx) => {
    const asset = await lockAsset(tx,assetId);
    const previous = await tx.calibrationSession.findFirst({ where: { assetId },orderBy: { sessionNo: 'desc' } });
    if (previous?.status==='in_progress') throw new ConflictError('A calibration is already in progress');
    if (previous?.finalStatus==='pass' && actor.role!=='admin') throw new ConflictError('Only an administrator can initiate a correction to a passed session');
    const [range,lab] = await Promise.all([tx.rangeThreshold.findUniqueOrThrow({ where: { id: asset.rangeThresholdId } }),tx.labDimension.findUnique({ where: { id: input.labDimensionId } })]);
    if (!lab) throw new NotFoundError('Lab sitting not found');
    const limits = await tx.rangeThresholdLimit.findMany({ where: { rangeThresholdId: range.id } });
    const derived = parseRange(range.rangeLabel,range.channel);
    if (!range.isActive || limits.length!==derived.timesToTest || derived.points.some((point) => !limits.some((limit) => limit.testPointPct===point.pct && point.volume.eq(limit.nominalVolumeUl.toString())))) throw new BusinessRuleError('LIMITS_REQUIRED','Capture all planned volume limits before calibration');
    const dates = calibrationDates(lab.processDate.toISOString().slice(0,10),input.nextCalibrationMonths);
    const session = await tx.calibrationSession.create({ data: { ...input,servicedBy: input.servicedBy ?? actor.displayName,assetId,customerId: asset.customerId,rangeThresholdId: range.id,sessionNo: (previous?.sessionNo ?? 0)+1,processDate: lab.processDate,dueDate: new Date(dates.dueDate),reminderDate: new Date(dates.reminderDate),createdBy: actor.id } });
    const audits: AuditEntry[] = [];
    const plans = planLots(range.rangeLabel,range.channel,input.oneDispensingPerChannel);
    for (const limit of limits) {
      const volume = await tx.calibrationVolumeResult.create({ data: { calibrationSessionId: session.id,assetId,rangeThresholdLimitId: limit.id,nominalVolumeUl: limit.nominalVolumeUl,inaccuracyLimitPct: limit.inaccuracyLimitPct,imprecisionLimitPct: limit.imprecisionLimitPct } });
      const lots = await tx.calibrationLot.createManyAndReturn({ data: plans.filter((lot) => limit.nominalVolumeUl.eq(lot.nominalVolumeUl))
        .map((lot) => ({ ...lot,calibrationVolumeResultId: volume.id,calibrationSessionId: session.id,assetId })) });
      audits.push(...lots.map((row): AuditEntry => ({ entityType: 'calibration_lot',entityId: row.id,action: 'create',after: row })));
      audits.push({ entityType: 'calibration_volume_result',entityId: volume.id,action: 'create',after: volume });
    }
    const updatedAsset = await tx.asset.update({ where: { id: assetId },data: { progress: 'in_progress' } });
    audits.push({ entityType: 'asset',entityId: assetId,action: 'start_calibration',before: asset,after: updatedAsset },
      { entityType: 'calibration_session',entityId: session.id,action: 'start',after: session });
    await recordAudits(tx,actor,requestId,audits); return session;
  });
}

export async function saveLot(actor: Actor, sessionId: string, lotNo: number, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const { masses } = readingsSchema.parse(raw);
  await transaction(async (tx) => {
    const session = await lockSession(tx,sessionId);
    const lab = await tx.labDimension.findUniqueOrThrow({ where: { id: session.labDimensionId } });
    const lot = await tx.calibrationLot.findUnique({ where: { calibrationSessionId_lotNo: { calibrationSessionId: sessionId,lotNo } } });
    if (!lot) throw new NotFoundError('Lot not found');
    const volumes = masses.map((mass) => toVolumeUl(mass,lab.zCorrectionValue.toString()));
    const previousReadings = await tx.calibrationReading.findMany({ where: { calibrationLotId: lot.id } });
    const audits: AuditEntry[] = [];
    for (const [index,massG] of masses.entries()) {
      const data = { calibrationLotId: lot.id,calibrationSessionId: sessionId,assetId: session.assetId,readingNo: index+1,massG,volumeUl: volumes[index] ?? '' };
      const before = previousReadings.find((reading) => reading.readingNo===index+1);
      const reading = await tx.calibrationReading.upsert({ where: { calibrationLotId_readingNo: { calibrationLotId: lot.id,readingNo: index+1 } },create: data,update: { massG,volumeUl: data.volumeUl } });
      audits.push({ entityType: 'calibration_reading',entityId: reading.id,action: 'save',before,after: reading });
    }
    await recordAudits(tx,actor,requestId,audits);
  });
  return sessionDetail(sessionId,actor.role==='executive');
}

export async function completeSession(actor: Actor, sessionId: string, requestId: string) {
  authorizeWrite(actor);
  await transaction(async (tx) => {
    const session = await lockSession(tx,sessionId);
    const [lots,readings,volumes,range] = await Promise.all([
      tx.calibrationLot.findMany({ where: { calibrationSessionId: sessionId },take: 36 }),
      tx.calibrationReading.findMany({ where: { calibrationSessionId: sessionId },take: 360 }),
      tx.calibrationVolumeResult.findMany({ where: { calibrationSessionId: sessionId },take: 3 }),
      tx.rangeThreshold.findUniqueOrThrow({ where: { id: session.rangeThresholdId } }),
    ]);
    const asset = await lockAsset(tx,session.assetId);
    if (lots.length===0 || readings.length!==lots.length*10) throw new BusinessRuleError('READINGS_REQUIRED','Every lot requires ten saved readings before completion');

    for (const lot of lots) {
      const lotReadings = readings.filter((reading) => reading.calibrationLotId===lot.id).map((reading) => reading.volumeUl.toString());
      const lotStats = statistics(lotReadings,lot.nominalVolumeUl.toString(),range.channelCount);
      await tx.calibrationLot.update({ where: { id: lot.id },data: lotStats });
    }

    const refreshedVolumes = [];
    for (const volume of volumes) {
      const pooledLots = lots.filter((lot) => lot.calibrationVolumeResultId===volume.id);
      const pooledReadings = readings.filter((reading) => pooledLots.some((lot) => lot.id===reading.calibrationLotId));
      const stats = statistics(pooledReadings.map((reading) => reading.volumeUl.toString()),volume.nominalVolumeUl.toString(),range.channelCount);
      refreshedVolumes.push(await tx.calibrationVolumeResult.update({ where: { id: volume.id },data: { ...stats,readingCount: pooledReadings.length,
        inaccuracyResult: compareLimit(stats.inaccuracyActualPct,volume.inaccuracyLimitPct.toString()),
        imprecisionResult: compareLimit(stats.imprecisionActualPct,volume.imprecisionLimitPct.toString()) } }));
    }
    const inaccuracyStatus = combineStatuses(refreshedVolumes.map((row) => row.inaccuracyResult));
    const imprecisionStatus = combineStatuses(refreshedVolumes.map((row) => row.imprecisionResult));
    const finalStatus = combineStatuses([inaccuracyStatus,imprecisionStatus]);
    await tx.calibrationSession.update({ where: { id: sessionId },data: { inaccuracyStatus,imprecisionStatus,finalStatus,status: 'completed',endTime: new Date() } });
    await tx.asset.update({ where: { id: session.assetId },data: { progress: 'completed' } });
    await recordAudit(tx,actor,requestId,'calibration_session',sessionId,'complete',session);
    await recordAudit(tx,actor,requestId,'asset',session.assetId,'complete_calibration',asset);
  });
  return sessionDetail(sessionId,actor.role==='executive');
}

export async function getSession(actor: Actor, sessionId: string) {
  if (actor.isPreview) throw new NotFoundError('Preview contains no live calibration sessions');
  return sessionDetail(sessionId,actor.role==='executive');
}

export async function createDamage(actor: Actor, assetId: string, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const input = damageSchema.parse(raw);
  return transaction(async (tx) => {
    await lockAsset(tx,assetId);
    const row = await tx.assetDamage.create({ data: { ...input,partCost: input.partCost ?? null,assetId,createdBy: actor.id } });
    await recordAudit(tx,actor,requestId,'asset_damage',row.id,'create');
    const { partCost,...safe } = row;
    return actor.role==='executive' ? { ...safe,partCost } : safe;
  });
}