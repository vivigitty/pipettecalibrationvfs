import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import type { Prisma } from '@prisma/client';
import { CertificateDocument } from '@/pdf/CertificateDocument';
import { certificateSchema } from '@/schemas/certificate';
import { getEnv } from '@/lib/env';
import { BusinessRuleError,ForbiddenError,NotFoundError } from '@/lib/errors';
import type { Actor } from '@/lib/rbac';
import { lockAsset } from '@/repositories/calibration';
import { transaction } from '@/repositories/inventory';

export async function downloadSessionCertificate(actor: Actor, sessionId: string) {
  if (actor.isPreview) throw new ForbiddenError('No certificates are generated in preview mode');
  const env = getEnv();
  if (env.CERTIFICATE_TEMPLATE_APPROVED!=='true' || !env.CERTIFICATE_FOOTER) throw new BusinessRuleError('TEMPLATE_UNAPPROVED','VFL must approve the template, logo and footer before certificate issuance');
  const { bytes,filename } = await transaction(async (tx) => {
    const session = await tx.calibrationSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError();
    const asset = await lockAsset(tx,session.assetId);
    return buildCertificatePdf(tx,session.id,asset.id);
  });
  if (bytes.length>1000000) throw new BusinessRuleError('PDF_TOO_LARGE','Certificate exceeds the 1 MB limit');
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf','Content-Disposition': `attachment; filename="${filename}"`,'Cache-Control': 'private, no-store' } });
}

async function buildCertificatePdf(tx: Prisma.TransactionClient, sessionId: string, assetId: string) {
  const session = await tx.calibrationSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (session.status!=='completed' || session.finalStatus!=='pass') throw new BusinessRuleError('SESSION_NOT_PASSED','Only completed passing sessions may be certified');
  const [asset,customer,range,lab,user,volumes,lots,readings,damages] = await Promise.all([
    tx.asset.findUniqueOrThrow({ where: { id: assetId } }),tx.customer.findUniqueOrThrow({ where: { id: session.customerId } }),tx.rangeThreshold.findUniqueOrThrow({ where: { id: session.rangeThresholdId } }),tx.labDimension.findUniqueOrThrow({ where: { id: session.labDimensionId } }),
    tx.user.findUniqueOrThrow({ where: { id: session.createdBy } }),tx.calibrationVolumeResult.findMany({ where: { calibrationSessionId: sessionId },orderBy: { nominalVolumeUl: 'asc' },take: 3 }),
    tx.calibrationLot.findMany({ where: { calibrationSessionId: sessionId },orderBy: { lotNo: 'asc' },take: 36 }),tx.calibrationReading.findMany({ where: { calibrationSessionId: sessionId },take: 360 }),tx.assetDamage.findMany({ where: { assetId },take: 100 }),
  ]);
  if (lots.length===0 || readings.length!==lots.length*10 || volumes.some((volume) => volume.inaccuracyResult!=='pass' || volume.imprecisionResult!=='pass')) throw new BusinessRuleError('INCOMPLETE_SESSION','All lots and passing volume results are required');
  const env = getEnv();
  const [balance,air,water,calibrator] = await Promise.all([tx.instrument.findUniqueOrThrow({ where: { id: lab.balanceInstrumentId } }),tx.instrument.findUniqueOrThrow({ where: { id: lab.airInstrumentId } }),tx.instrument.findUniqueOrThrow({ where: { id: lab.waterThermometerInstrumentId } }),tx.user.findUniqueOrThrow({ where: { id: lab.calibratedByUserId } })]);
  const data = certificateSchema.parse(JSON.parse(JSON.stringify({ ...asset,...customer,make: range.make,model: range.model,rangeLabel: range.rangeLabel,channel: `${range.channel} channel`,...lab,sessionNo: session.sessionNo,reminderDate: session.reminderDate,dueDate: session.dueDate,servicedBy: session.servicedBy?.trim() || calibrator.displayName || user.displayName,balance,air,water,logoUrl: await resolveCertificateLogo(env.CERTIFICATE_LOGO_URL),footer: env.CERTIFICATE_FOOTER,signatureUrl: env.CERTIFICATE_SIGNATURE_ENABLED==='true' ? await resolveCertificateSignature() : null,signatureDate: signatureDate(env.CERTIFICATE_SIGNATURE_DATE,session.processDate),
    damagedParts: damages.map((damage) => damage.damagedPartName).join(', ') || 'Nil',replacedParts: damages.filter((damage) => damage.partReplaced).map((damage) => damage.damagedPartName).join(', ') || 'Nil',
    volumes: volumes.map((volume) => ({ ...volume,readings: lots.filter((lot) => lot.calibrationVolumeResultId===volume.id).flatMap((lot) => readings.filter((reading) => reading.calibrationLotId===lot.id).sort((left,right) => left.readingNo-right.readingNo)) })) })));
  const bytes = await renderToBuffer(<CertificateDocument data={data} />);
  const inventory = asset.inventoryNumber.replace(/[^a-zA-Z0-9_-]/g,'_') || 'inventory';
  const processDate = session.processDate.toISOString().slice(0,10);
  return { bytes,filename: `${inventory}_${processDate}.pdf` };
}

async function resolveCertificateLogo(fallbackUrl?: string) {
  const logoPath = path.join(process.cwd(),'public','VFL_Logo.png');
  try {
    const bytes = await readFile(logoPath);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    if (fallbackUrl) return fallbackUrl;
    throw new BusinessRuleError('TEMPLATE_UNAPPROVED','VFL logo is missing. Add public/VFL_Logo.png before certificate issuance');
  }
}

async function resolveCertificateSignature() {
  try {
    const bytes = await readFile(path.join(process.cwd(),'public','VFL_Signature.png'));
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    throw new BusinessRuleError('TEMPLATE_UNAPPROVED','Signature is enabled but public/VFL_Signature.png is missing');
  }
}

function signatureDate(mode: 'none' | 'calibration' | 'issue', processDate: Date) {
  if (mode==='calibration') return processDate.toISOString().slice(0,10);
  if (mode==='issue') return new Date().toISOString().slice(0,10);
  return null;
}