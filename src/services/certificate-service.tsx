import { createHash,randomUUID } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { CertificateDocument } from '@/pdf/CertificateDocument';
import { certificateSchema } from '@/schemas/certificate';
import { idSchema,voidSchema } from '@/schemas/resources';
import { getEnv } from '@/lib/env';
import { BusinessRuleError,ConflictError,ForbiddenError,NotFoundError } from '@/lib/errors';
import { authorizeWrite,type Actor } from '@/lib/rbac';
import { readCertificate,storeCertificate } from '@/lib/storage';
import { recordAudit } from '@/repositories/audit';
import { lockAsset } from '@/repositories/calibration';
import { inventoryDb,transaction } from '@/repositories/inventory';

export async function generateCertificate(actor: Actor, sessionId: string, key: string, requestId: string) {
  authorizeWrite(actor);
  const idempotencyKey = idSchema.parse(key);
  const env = getEnv();
  if (env.CERTIFICATE_TEMPLATE_APPROVED!=='true' || !env.CERTIFICATE_LOGO_URL || !env.CERTIFICATE_FOOTER) throw new BusinessRuleError('TEMPLATE_UNAPPROVED','VFL must approve the template, logo and footer before certificate issuance');
  return transaction(async (tx) => {
    const session = await tx.calibrationSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError();
    const asset = await lockAsset(tx,session.assetId);
    const existingKey = await tx.assetCertification.findUnique({ where: { idempotencyKey } });
    if (existingKey) {
      if (existingKey.calibrationSessionId!==sessionId || existingKey.voidedAt) throw new ConflictError('Idempotency key belongs to another or voided certificate');
      return existingKey;
    }
    if (session.status!=='completed' || session.finalStatus!=='pass') throw new BusinessRuleError('SESSION_NOT_PASSED','Only completed passing sessions may be certified');
    if (await tx.assetCertification.findFirst({ where: { assetId: asset.id,voidedAt: null } })) throw new ConflictError('Certificate already exists; download the stored copy');
    const [customer,range,lab,user,volumes,lots,readings,damages] = await Promise.all([
      tx.customer.findUniqueOrThrow({ where: { id: asset.customerId } }),tx.rangeThreshold.findUniqueOrThrow({ where: { id: asset.rangeThresholdId } }),tx.labDimension.findUniqueOrThrow({ where: { id: session.labDimensionId } }),
      tx.user.findUniqueOrThrow({ where: { id: session.createdBy } }),tx.calibrationVolumeResult.findMany({ where: { calibrationSessionId: sessionId },orderBy: { nominalVolumeUl: 'asc' },take: 3 }),
      tx.calibrationLot.findMany({ where: { calibrationSessionId: sessionId },orderBy: { lotNo: 'asc' },take: 36 }),tx.calibrationReading.findMany({ where: { calibrationSessionId: sessionId },take: 360 }),tx.assetDamage.findMany({ where: { assetId: asset.id },take: 100 }),
    ]);
    if (lots.length===0 || readings.length!==lots.length*10 || volumes.some((volume) => volume.inaccuracyResult!=='pass' || volume.imprecisionResult!=='pass')) throw new BusinessRuleError('INCOMPLETE_SESSION','All lots and passing volume results are required');
    const [balance,air,water,calibrator] = await Promise.all([tx.instrument.findUniqueOrThrow({ where: { id: lab.balanceInstrumentId } }),tx.instrument.findUniqueOrThrow({ where: { id: lab.airInstrumentId } }),tx.instrument.findUniqueOrThrow({ where: { id: lab.waterThermometerInstrumentId } }),tx.user.findUniqueOrThrow({ where: { id: lab.calibratedByUserId } })]);
    const data = certificateSchema.parse(JSON.parse(JSON.stringify({ ...asset,...customer,make: range.make,model: range.model,rangeLabel: range.rangeLabel,channel: `${range.channel} channel`,...lab,dueDate: session.dueDate,servicedBy: calibrator.displayName || user.displayName,balance,air,water,logoUrl: env.CERTIFICATE_LOGO_URL,footer: env.CERTIFICATE_FOOTER,
      damagedParts: damages.map((damage) => damage.damagedPartName).join(', ') || 'Nil',replacedParts: damages.filter((damage) => damage.partReplaced).map((damage) => damage.damagedPartName).join(', ') || 'Nil',
      volumes: volumes.map((volume) => ({ ...volume,readings: lots.filter((lot) => lot.calibrationVolumeResultId===volume.id).flatMap((lot) => readings.filter((reading) => reading.calibrationLotId===lot.id).sort((left,right) => left.readingNo-right.readingNo)) })) })));
    const bytes = await renderToBuffer(<CertificateDocument data={data} />);
    if (bytes.length>1000000) throw new BusinessRuleError('PDF_TOO_LARGE','Certificate exceeds the 1 MB limit');
    const filename = `${asset.inventoryNumber.replace(/[^a-zA-Z0-9_-]/g,'_')}_${range.rangeLabel}ul.pdf`;
    const storageKey = `${asset.id}/${randomUUID()}/${filename}`;
    await storeCertificate(storageKey,bytes);
    const certificate = await tx.assetCertification.create({ data: { assetId: asset.id,customerId: asset.customerId,calibrationSessionId: sessionId,storageKey,sha256: createHash('sha256').update(bytes).digest('hex'),templateVersion: 'vfl-draft-0.1',generatedBy: actor.id,idempotencyKey } });
    await recordAudit(tx,actor,requestId,'asset_certification',certificate.id,'generate'); return certificate;
  });
}

export async function downloadCertificate(actor: Actor, id: string) {
  if (actor.isPreview) throw new ForbiddenError('No certificates are stored in preview mode');
  const certificate = await inventoryDb.assetCertification.findUnique({ where: { id } });
  if (!certificate || (certificate.voidedAt && actor.role!=='admin')) throw new NotFoundError();
  const bytes = await readCertificate(certificate.storageKey);
  if (createHash('sha256').update(bytes).digest('hex')!==certificate.sha256) throw new Error('Certificate checksum mismatch');
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf','Content-Disposition': `attachment; filename="${certificate.storageKey.split('/').at(-1) ?? 'certificate.pdf'}"`,'Cache-Control': 'private, no-store' } });
}

export async function voidCertificate(actor: Actor, id: string, raw: unknown, requestId: string) {
  authorizeWrite(actor,true);
  const { reason } = voidSchema.parse(raw);
  return transaction(async (tx) => {
    const before = await tx.assetCertification.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    await lockAsset(tx,before.assetId);
    if (before.voidedAt) throw new ConflictError('Certificate is already voided');
    const certificate = await tx.assetCertification.update({ where: { id },data: { voidedAt: new Date(),voidedBy: actor.id,voidReason: reason } });
    await recordAudit(tx,actor,requestId,'asset_certification',id,'void',before); return certificate;
  });
}