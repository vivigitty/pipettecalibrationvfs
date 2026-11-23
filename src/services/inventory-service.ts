import { parseRange } from '@/domain/range';
import { resolveZ } from '@/domain/z-factor';
import type { ChannelType } from '@prisma/client';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { authorizeWrite, type Actor } from '@/lib/rbac';
import { recordAudit, recordAudits } from '@/repositories/audit';
import { inventoryDb, listInventory, transaction } from '@/repositories/inventory';
import { loadZGrid } from '@/repositories/z-grid';
import { assetAssignmentSchema, assetBatchSchema, customerSchema, instrumentSchema, labSchema, querySchema, rangeSchema, userSchema, type Resource } from '@/schemas/resources';
import { previewList } from './preview-data';

export async function listResources(actor: Actor, resource: Resource, raw: unknown) {
  if (resource==='users' && actor.role!=='admin') throw new ForbiddenError();
  const query = querySchema.parse(raw);
  return actor.isPreview ? previewList(resource,query) : listInventory(resource,query);
}

export async function createResource(actor: Actor, resource: Resource, raw: unknown, requestId: string) {
  authorizeWrite(actor, resource==='users');
  switch (resource) {
    case 'customers': return transaction(async (tx) => {
      const customer = await tx.customer.create({ data: { ...customerSchema.parse(raw),createdBy: actor.id } });
      await recordAudit(tx,actor,requestId,'customer',customer.id,'create',undefined,customer); return customer;
    });
    case 'ranges': return createRange(actor,raw,requestId);
    case 'assets': return createAssets(actor,raw,requestId);
    case 'instruments': return transaction(async (tx) => {
      const input = instrumentSchema.parse(raw);
      const instrument = await tx.instrument.create({ data: { ...input,calibrationDueDate: new Date(input.calibrationDueDate) } });
      await recordAudit(tx,actor,requestId,'instrument',instrument.id,'create',undefined,instrument); return instrument;
    });
    case 'lab-dimensions': return createLab(actor,raw,requestId);
    case 'users': return transaction(async (tx) => {
      const user = await tx.user.create({ data: userSchema.parse(raw) });
      await recordAudit(tx,actor,requestId,'user',user.id,'create',undefined,user); return user;
    });
  }
}

async function createRange(actor: Actor, raw: unknown, requestId: string) {
  const input = rangeSchema.parse(raw);
  let derived: ReturnType<typeof parseRange>;
  try { derived = parseRange(input.rangeLabel,input.channel); } catch { throw new ValidationError('Invalid volume range'); }
  if (input.limits.length!==derived.timesToTest || derived.points.some((point) => input.limits.filter((limit) => limit.testPointPct===point.pct).length!==1)) throw new ValidationError('Capture exactly one limit pair for each planned test point');
  return transaction(async (tx) => {
    const range = await tx.rangeThreshold.create({ data: { rangeLabel: input.rangeLabel,channel: input.channel as ChannelType,make: input.make,model: input.model,
      rangeMinUl: derived.min?.toString() ?? null,rangeMaxUl: derived.max.toString(),channelCount: derived.channelCount,timesToTest: derived.timesToTest,repeats: derived.repeats } });
    for (const limit of input.limits) {
      const point = derived.points.find((candidate) => candidate.pct===limit.testPointPct);
      if (!point) throw new ValidationError('Unexpected test point');
      const row = await tx.rangeThresholdLimit.create({ data: { ...limit,rangeThresholdId: range.id,nominalVolumeUl: point.volume.toString(),capturedBy: actor.id } });
      await recordAudit(tx,actor,requestId,'range_threshold_limit',row.id,'create',undefined,row);
    }
    await recordAudit(tx,actor,requestId,'range_threshold',range.id,'create',undefined,range); return range;
  });
}

async function createAssets(actor: Actor, raw: unknown, requestId: string) {
  const input = assetBatchSchema.parse(raw);
  return transaction(async (tx) => {
    const rows = [];
    for (const draft of input.assets) {
      const [customer,range] = await Promise.all([tx.customer.findFirst({ where: { id: draft.customerId,isActive: true } }),tx.rangeThreshold.findFirst({ where: { id: draft.rangeThresholdId,isActive: true } })]);
      if (!customer || !range) throw new NotFoundError('Select an active customer and range');
      const asset = await tx.asset.create({ data: { ...draft,createdBy: actor.id } });
      await recordAudit(tx,actor,requestId,'asset',asset.id,'create',undefined,asset); rows.push(asset);
    }
    return rows;
  });
}

async function createLab(actor: Actor, raw: unknown, requestId: string) {
  const input = labSchema.parse(raw);
  return transaction(async (tx) => {
    const slots = [[input.balanceInstrumentId,'balance'],[input.airInstrumentId,'air_thermometer'],[input.waterThermometerInstrumentId,'water_thermometer']] as const;
    const instruments = await tx.instrument.findMany({ where: { id: { in: slots.map(([id]) => id) },isActive: true } });
    for (const [id,type] of slots) {
      const instrument = instruments.find((row) => row.id===id && row.instrumentType===type);
      if (!instrument || instrument.calibrationDueDate < new Date(input.processDate)) throw new BusinessRuleError('INSTRUMENT_EXPIRED','Select the correct instrument type with a valid calibration due date');
    }
    const resolved = resolveZ(await loadZGrid(tx),input.ddWaterTempC,input.airPressureHpa);
    const lab = await tx.labDimension.create({ data: { ...input,processDate: new Date(input.processDate),calibratedByUserId: actor.id,zCorrectionValue: resolved.zCorrectionValue,zSourceVersion: resolved.sourceVersion } });
    await recordAudit(tx,actor,requestId,'lab_dimension',lab.id,'create',undefined,lab); return lab;
  });
}

/** Pre-assigns an environmental condition (and so the calibration date) to not-started pipettes in bulk. */
export async function assignAssets(actor: Actor, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const input = assetAssignmentSchema.parse(raw);
  const assetIds = [...new Set(input.assetIds)];
  return transaction(async (tx) => {
    const lab = await tx.labDimension.findUnique({ where: { id: input.labDimensionId } });
    if (!lab) throw new NotFoundError('Environmental condition not found');
    const assets = await tx.asset.findMany({ where: { id: { in: assetIds } } });
    if (assets.length!==assetIds.length) throw new NotFoundError('One or more pipettes were not found');
    if (assets.some((asset) => asset.progress!=='not_started')) throw new BusinessRuleError('ASSET_NOT_PENDING','Only pipettes that have not started calibration can be assigned');
    await tx.asset.updateMany({ where: { id: { in: assetIds } },data: { assignedLabDimensionId: lab.id } });
    await recordAudits(tx,actor,requestId,assets.map((asset) => ({ entityType: 'asset' as const,entityId: asset.id,action: 'assign_environmental_condition',before: asset,after: { ...asset,assignedLabDimensionId: lab.id } })));
    return { assigned: assetIds.length,labDimensionId: lab.id,processDate: lab.processDate };
  });
}

export async function getAsset(actor: Actor, id: string) {
  if (actor.isPreview) {
    const asset = previewList('assets',querySchema.parse({})).data.find((row) => row.id===id);
    if (!asset) throw new NotFoundError();
    return { asset: { ...asset,calibrationValidityMonths: 12 },sessions: [],damages: [] };
  }
  const asset = await inventoryDb.asset.findUnique({ where: { id } });
  if (!asset) throw new NotFoundError();
  const [sessions,damages] = await Promise.all([inventoryDb.calibrationSession.findMany({ where: { assetId: id },select: { id: true,sessionNo: true,status: true,finalStatus: true,dueDate: true },orderBy: { sessionNo: 'desc' },take: 60 }),inventoryDb.assetDamage.findMany({ where: { assetId: id },take: 100 })]);
  return { asset,sessions,damages: damages.map(({ partCost,...row }) => actor.role==='executive' ? { ...row,partCost } : row) };
}

export async function getLabConditions(actor: Actor, id: string) {
  if (actor.isPreview) {
    const lab = previewList('lab-dimensions',querySchema.parse({})).data.find((row) => row.id===id);
    if (!lab) throw new NotFoundError('Environmental condition not found');
    const instruments = previewList('instruments',querySchema.parse({})).data;
    return { ...lab,balance: instruments.find((row) => row.id===lab.balanceInstrumentId),air: instruments.find((row) => row.id===lab.airInstrumentId),water: instruments.find((row) => row.id===lab.waterThermometerInstrumentId) };
  }
  const lab = await inventoryDb.labDimension.findUnique({ where: { id },include: { balance: true,air: true,water: true } });
  if (!lab) throw new NotFoundError('Environmental condition not found');
  return lab;
}