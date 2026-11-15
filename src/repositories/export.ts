import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const include = {
  asset: { include: { customer: true, range: true, damages: true } },
  lab: { include: { balance: true, air: true, water: true, calibrator: true } },
  volumes: { orderBy: { nominalVolumeUl: 'asc' }, take: 3 },
  lots: { orderBy: { lotNo: 'asc' }, take: 36, include: { readings: { orderBy: { readingNo: 'asc' } } } },
} satisfies Prisma.CalibrationSessionInclude;

export type CompletedSession = Prisma.CalibrationSessionGetPayload<{ include: typeof include }>;

/** Keyset-paged so an export never loads the whole history in one query. */
export function listCompletedSessions(filter: { from?: Date; to?: Date }, after: string | undefined, take: number) {
  const processDate = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
  return db.calibrationSession.findMany({
    where: { status: 'completed', ...(filter.from || filter.to ? { processDate } : {}) },
    include, take, orderBy: [{ processDate: 'asc' }, { id: 'asc' }],
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });
}