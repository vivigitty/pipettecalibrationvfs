import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';

export async function lockAsset(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM assets WHERE id=${id}::uuid FOR UPDATE`;
  const asset = await tx.asset.findUnique({ where: { id } });
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}
export async function lockSession(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM calibration_sessions WHERE id=${id}::uuid FOR UPDATE`;
  const session = await tx.calibrationSession.findUnique({ where: { id } });
  if (!session) throw new NotFoundError('Session not found');
  if (session.status!=='in_progress') throw new ConflictError('Closed sessions are immutable');
  return session;
}

export async function sessionDetail(id: string, isExecutive: boolean) {
  const session = await db.calibrationSession.findUnique({ where: { id } });
  if (!session) throw new NotFoundError('Session not found');
  const [asset,lab,volumes,lots,readings,certificates] = await Promise.all([
    db.asset.findUniqueOrThrow({ where: { id: session.assetId } }),db.labDimension.findUniqueOrThrow({ where: { id: session.labDimensionId } }),
    db.calibrationVolumeResult.findMany({ where: { calibrationSessionId: id },orderBy: { nominalVolumeUl: 'asc' },take: 3 }),
    db.calibrationLot.findMany({ where: { calibrationSessionId: id },orderBy: { lotNo: 'asc' },take: 36 }),
    db.calibrationReading.findMany({ where: { calibrationSessionId: id },orderBy: { readingNo: 'asc' },take: 360 }),
    db.assetCertification.findMany({ where: { calibrationSessionId: id,voidedAt: null },select: { id: true,generatedAt: true },take: 1 }),
  ]);
  const { deviceIp,entryLocation,startTime,endTime,...safeSession } = session;
  return { session: isExecutive ? { ...safeSession,deviceIp,entryLocation,startTime,endTime } : safeSession,asset,lab,volumes,lots: lots.map((lot) => ({ ...lot,readings: readings.filter((reading) => reading.calibrationLotId===lot.id) })),certificates };
}