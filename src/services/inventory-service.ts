import { parseRange } from '@/domain/range';
import { resolveZ } from '@/domain/z-factor';
import type { ChannelType } from '@prisma/client';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { authorizeWrite, type Actor } from '@/lib/rbac';
import { recordAudit, recordAudits } from '@/repositories/audit';
import { inventoryDb, listInventory, transaction } from '@/repositories/inventory';
import { loadZGrid } from '@/repositories/z-grid';
import { assetBatchSchema, assetValiditySchema, customerSchema, instrumentSchema, labSchema, masterInstrumentSchema, querySchema, rangeSchema, recalibrationSchema, userSchema, userSignatureSchema, type InstrumentType, type Resource } from '@/schemas/resources';
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

/**
 * Registers a batch in a fixed number of database round trips (lookups, one insert, one audit insert),
 * so the transaction stays short however many pipettes are entered.
 */
async function createAssets(actor: Actor, raw: unknown, requestId: string) {
  const input = assetBatchSchema.parse(raw);
  const inventoryNumbers = input.assets.map((draft) => draft.inventoryNumber);
  const repeated = [...new Set(inventoryNumbers.filter((value,index) => inventoryNumbers.indexOf(value)!==index))];
  if (repeated.length) throw new ValidationError(`Inventory number entered more than once: ${repeated.join(', ')}`);
  return transaction(async (tx) => {
    const customerIds = [...new Set(input.assets.map((draft) => draft.customerId))];
    const rangeIds = [...new Set(input.assets.map((draft) => draft.rangeThresholdId))];
    const customers = await tx.customer.findMany({ where: { id: { in: customerIds },isActive: true },select: { id: true } });
    const ranges = await tx.rangeThreshold.findMany({ where: { id: { in: rangeIds },isActive: true },select: { id: true } });
    if (customers.length!==customerIds.length || ranges.length!==rangeIds.length) throw new NotFoundError('Select an active customer and range');
    const existing = await tx.asset.findMany({ where: { inventoryNumber: { in: inventoryNumbers } },select: { inventoryNumber: true } });
    if (existing.length) throw new ConflictError(`Inventory number already registered: ${existing.map((row) => row.inventoryNumber).join(', ')}. Use Schedule re-calibration for an existing pipette.`);
    const rows = await tx.asset.createManyAndReturn({ data: input.assets.map((draft) => ({ ...draft,createdBy: actor.id })) });
    await recordAudits(tx,actor,requestId,rows.map((asset) => ({ entityType: 'asset' as const,entityId: asset.id,action: 'create',after: asset })));
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

/** Sets the calibration validity used for the next due date of each selected pipette that is not mid-calibration. */
export async function assignValidity(actor: Actor, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const input = assetValiditySchema.parse(raw);
  const assetIds = [...new Set(input.assetIds)];
  return transaction(async (tx) => {
    const assets = await tx.asset.findMany({ where: { id: { in: assetIds } } });
    if (assets.length!==assetIds.length) throw new NotFoundError('One or more pipettes were not found');
    if (assets.some((asset) => asset.progress==='in_progress')) throw new BusinessRuleError('ASSET_IN_PROGRESS','Calibration validity cannot be changed while a calibration is in progress');
    await tx.asset.updateMany({ where: { id: { in: assetIds } },data: { calibrationValidityMonths: input.calibrationValidityMonths } });
    await recordAudits(tx,actor,requestId,assets.map((asset) => ({ entityType: 'asset' as const,entityId: asset.id,action: 'assign_calibration_validity',before: asset,after: { ...asset,calibrationValidityMonths: input.calibrationValidityMonths } })));
    return { assigned: assetIds.length,calibrationValidityMonths: input.calibrationValidityMonths };
  });
}

/** Re-opens calibrated pipettes (same inventory number) as not-started jobs planned for the chosen date. */
export async function scheduleRecalibration(actor: Actor, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const input = recalibrationSchema.parse(raw);
  if (input.scheduledDate < new Date().toISOString().slice(0,10)) throw new ValidationError('Choose today or a future date for the re-calibration');
  const assetIds = [...new Set(input.assetIds)];
  return transaction(async (tx) => {
    const assets = await tx.asset.findMany({ where: { id: { in: assetIds } } });
    if (assets.length!==assetIds.length) throw new NotFoundError('One or more pipettes were not found');
    if (assets.some((asset) => asset.progress!=='completed')) throw new BusinessRuleError('ASSET_NOT_COMPLETED','Only pipettes with a completed calibration can be scheduled for re-calibration');
    const data = { progress: 'not_started' as const,scheduledCalibrationDate: new Date(input.scheduledDate),assignedLabDimensionId: null,...(input.calibrationValidityMonths ? { calibrationValidityMonths: input.calibrationValidityMonths } : {}) };
    await tx.asset.updateMany({ where: { id: { in: assetIds } },data });
    await recordAudits(tx,actor,requestId,assets.map((asset) => ({ entityType: 'asset' as const,entityId: asset.id,action: 'schedule_recalibration',before: asset,after: { ...asset,...data } })));
    return { scheduled: assetIds.length,scheduledDate: input.scheduledDate };
  });
}

const INSTRUMENT_TYPES: InstrumentType[] = ['balance','air_thermometer','water_thermometer'];

/** Current master instrument per measurement-device type (missing types are omitted). */
export async function getMasterInstruments(actor: Actor) {
  if (actor.isPreview) {
    const instruments = previewList('instruments',querySchema.parse({ pageSize: 100 })).data;
    return { masters: INSTRUMENT_TYPES.map((type) => instruments.find((row) => row.instrumentType===type)).filter(Boolean) };
  }
  const masters = await inventoryDb.masterInstrument.findMany({ include: { instrument: true } });
  return { masters: masters.map((master) => master.instrument).filter((instrument) => instrument.isActive) };
}

/** Makes an instrument the master for its type; it is pre-filled on every new environmental condition from then on. */
export async function setMasterInstrument(actor: Actor, raw: unknown, requestId: string) {
  authorizeWrite(actor);
  const { instrumentId } = masterInstrumentSchema.parse(raw);
  return transaction(async (tx) => {
    const instrument = await tx.instrument.findFirst({ where: { id: instrumentId,isActive: true } });
    if (!instrument) throw new NotFoundError('Instrument not found');
    const before = await tx.masterInstrument.findUnique({ where: { instrumentType: instrument.instrumentType } });
    const master = await tx.masterInstrument.upsert({ where: { instrumentType: instrument.instrumentType },create: { instrumentType: instrument.instrumentType,instrumentId,assignedBy: actor.id },update: { instrumentId,assignedBy: actor.id } });
    await recordAudit(tx,actor,requestId,'instrument',instrumentId,'set_master',before ?? undefined,master);
    return { ...instrument,isMaster: true };
  });
}

/** Whether the signed-in user has a saved default certificate signature, with the image itself. */
export async function getMySignature(actor: Actor) {
  if (actor.isPreview) return { hasSignature: false,imageDataUrl: null };
  const signature = await inventoryDb.userSignature.findUnique({ where: { userId: actor.id } });
  return { hasSignature: Boolean(signature),imageDataUrl: signature?.imageDataUrl ?? null };
}

/** Saves the signed-in user's default certificate signature. */
export async function saveMySignature(actor: Actor, raw: unknown, requestId: string) {
  if (actor.isPreview) throw new ForbiddenError('Read-only preview: connect PostgreSQL and SSO to save records');
  const { imageDataUrl } = userSignatureSchema.parse(raw);
  return transaction(async (tx) => {
    const before = await tx.userSignature.findUnique({ where: { userId: actor.id },select: { updatedAt: true } });
    await tx.userSignature.upsert({ where: { userId: actor.id },create: { userId: actor.id,imageDataUrl },update: { imageDataUrl } });
    await recordAudit(tx,actor,requestId,'user',actor.id,before ? 'update_signature' : 'create_signature');
    return { hasSignature: true };
  });
}

export async function getAsset(actor: Actor, id: string) {
  if (actor.isPreview) {
    const asset = previewList('assets',querySchema.parse({})).data.find((row) => row.id===id);
    if (!asset) throw new NotFoundError();
    return { asset: { ...asset,calibrationValidityMonths: null },sessions: [],damages: [] };
  }
  const asset = await inventoryDb.asset.findUnique({ where: { id } });
  if (!asset) throw new NotFoundError();
  const range = await inventoryDb.rangeThreshold.findUnique({ where: { id: asset.rangeThresholdId },select: { rangeLabel: true,make: true,model: true,channel: true,channelCount: true } });
  const [sessions,damages] = await Promise.all([inventoryDb.calibrationSession.findMany({ where: { assetId: id },select: { id: true,sessionNo: true,status: true,finalStatus: true,dueDate: true },orderBy: { sessionNo: 'desc' },take: 60 }),inventoryDb.assetDamage.findMany({ where: { assetId: id },take: 100 })]);
  return { asset: { ...asset,...range },sessions,damages: damages.map(({ partCost,...row }) => actor.role==='executive' ? { ...row,partCost } : row) };
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