import { calibrationDates } from '@/domain/dates';
import { parseRange, planLots } from '@/domain/range';
import { combineStatuses, compareLimit, statistics, toVolumeUl } from '@/domain/statistics';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/lib/errors';
import { authorizeWrite, type Actor } from '@/lib/rbac';
import { recordAudit } from '@/repositories/audit';
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
    if (await tx.assetCertification.findFirst({ where: { assetId,voidedAt: null } })) throw new ConflictError('Void the active certificate before starting a correction');
    const [range,lab] = await Promise.all([tx.rangeThreshold.findUniqueOrThrow({ where: { id: asset.rangeThresholdId } }),tx.labDimension.findUnique({ where: { id: input.labDimensionId } })]);
    if (!lab) throw new NotFoundError('Lab sitting not found');
    const limits = await tx.rangeThresholdLimit.findMany({ where: { rangeThresholdId: range.id } });
    const derived = parseRange(range.rangeLabel,range.channel);
    if (!range.isActive || limits.length!==derived.timesToTest || derived.points.some((point) => !limits.some((limit) => limit.testPointPct===point.pct && point.volume.eq(limit.nominalVolumeUl.toString())))) throw new BusinessRuleError('LIMITS_REQUIRED','Capture all planned volume limits before calibration');
    const dates = calibrationDates(lab.processDate.toISOString().slice(0,10),input.nextCalibrationMonths);
    const session = await tx.calibrationSession.create({ data: { ...input,assetId,customerId: asset.customerId,rangeThresholdId: range.id,sessionNo: (previous?.sessionNo ?? 0)+1,processDate: lab.processDate,dueDate: new Date(dates.dueDate),reminderDate: new Date(dates.reminderDate),createdBy: actor.id } });
    for (const limit of limits) {
      const volume = await tx.calibrationVolumeResult.create({ data: { calibrationSessionId: session.id,assetId,rangeThresholdLimitId: limit.id,nominalVolumeUl: limit.nominalVolumeUl,inaccuracyLimitPct: limit.inaccuracyLimitPct,imprecisionLimitPct: limit.imprecisionLimitPct } });
      const plans = planLots(range.rangeLabel,range.channel,input.oneDispensingPerChannel).filter((lot) => limit.nominalVolumeUl.eq(lot.nominalVolumeUl));
      for (const lot of plans) {
        const row = await tx.calibrationLot.create({ data: { ...lot,calibrationVolumeResultId: volume.id,calibrationSessionId: session.id,assetId } });
        await recordAudit(tx,actor,requestId,'calibration_lot',row.id,'create');
      }
      await recordAudit(tx,actor,requestId,'calibration_volume_result',volume.id,'create');
    }
    await tx.asset.update({ where: { id: assetId },data: { progress: 'in_progress' } });
    await recordAudit(tx,actor,requestId,'asset',assetId,'start_calibration',asset);
    await recordAudit(tx,actor,requestId,'calibration_session',session.id,'start'); return session;
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
    for (const [index,massG] of masses.entries()) {
      const data = { calibrationLotId: lot.id,calibrationSessionId: sessionId,assetId: session.assetId,readingNo: index+1,massG,volumeUl: volumes[index] ?? '' };
      const before = await tx.calibrationReading.findUnique({ where: { calibrationLotId_readingNo: { calibrationLotId: lot.id,readingNo: index+1 } } });
      const reading = await tx.calibrationReading.upsert({ where: { calibrationLotId_readingNo: { calibrationLotId: lot.id,readingNo: index+1 } },create: data,update: { massG,volumeUl: data.volumeUl } });
      await recordAudit(tx,actor,requestId,'calibration_reading',reading.id,'save',before ?? undefined);
    }
    await tx.calibrationLot.update({ where: { id: lot.id },data: statistics(volumes,lot.nominalVolumeUl.toString()) });
    await recordAudit(tx,actor,requestId,'calibration_lot',lot.id,'save',lot);
    const pooledLots = await tx.calibrationLot.findMany({ where: { calibrationVolumeResultId: lot.calibrationVolumeResultId },take: 12 });
    const readings = await tx.calibrationReading.findMany({ where: { calibrationLotId: { in: pooledLots.map((row) => row.id) } },take: 120 });
    const volume = await tx.calibrationVolumeResult.findUniqueOrThrow({ where: { id: lot.calibrationVolumeResultId } });
    const stats = statistics(readings.map((reading) => reading.volumeUl.toString()),volume.nominalVolumeUl.toString());
    const isComplete = readings.length===pooledLots.length*10;
    await tx.calibrationVolumeResult.update({ where: { id: volume.id },data: { ...stats,readingCount: readings.length,
      inaccuracyResult: isComplete ? compareLimit(stats.inaccuracyActualPct,volume.inaccuracyLimitPct.toString()) : 'pending',
      imprecisionResult: isComplete ? compareLimit(stats.imprecisionActualPct,volume.imprecisionLimitPct.toString()) : 'pending' } });
    await recordAudit(tx,actor,requestId,'calibration_volume_result',volume.id,'recalculate',volume);
  });
  return sessionDetail(sessionId,actor.role==='executive');
}

export async function completeSession(actor: Actor, sessionId: string, requestId: string) {
  authorizeWrite(actor);
  await transaction(async (tx) => {
    const session = await lockSession(tx,sessionId);
    const [lots,readings,volumes] = await Promise.all([tx.calibrationLot.count({ where: { calibrationSessionId: sessionId } }),tx.calibrationReading.count({ where: { calibrationSessionId: sessionId } }),tx.calibrationVolumeResult.findMany({ where: { calibrationSessionId: sessionId },take: 3 })]);
    const asset = await lockAsset(tx,session.assetId);
    const inaccuracyStatus = combineStatuses(volumes.map((row) => row.inaccuracyResult));
    const imprecisionStatus = combineStatuses(volumes.map((row) => row.imprecisionResult));
    const finalStatus = combineStatuses([inaccuracyStatus,imprecisionStatus]);
    if (lots===0 || readings!==lots*10 || finalStatus==='pending') throw new BusinessRuleError('READINGS_REQUIRED','Every lot requires ten saved readings before completion');
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
    if (await tx.assetCertification.findFirst({ where: { assetId,voidedAt: null } })) throw new ConflictError('Damage records cannot change after certification');
    const row = await tx.assetDamage.create({ data: { ...input,partCost: input.partCost ?? null,assetId,createdBy: actor.id } });
    await recordAudit(tx,actor,requestId,'asset_damage',row.id,'create');
    const { partCost,...safe } = row;
    return actor.role==='executive' ? { ...safe,partCost } : safe;
  });
}