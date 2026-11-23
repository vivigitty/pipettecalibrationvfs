import type { CalibrationLot, CalibrationReading, Prisma } from '@prisma/client';
import { compareLimit, statistics } from '@/domain/statistics';

const READINGS_PER_LOT = 10;

/**
 * FR-14/FR-15: recompute lot statistics and pooled volume results from saved readings.
 * Volumes whose lots are not all fully read are left untouched (pending), so this is safe to run
 * after a partial save as well as at completion.
 */
export async function refreshSessionResults(tx: Prisma.TransactionClient, sessionId: string, rangeThresholdId: string, onlyLotIds?: Set<string>) {
  const [lots,readings,volumes,range] = await Promise.all([
    tx.calibrationLot.findMany({ where: { calibrationSessionId: sessionId },take: 36 }),
    tx.calibrationReading.findMany({ where: { calibrationSessionId: sessionId },take: 360 }),
    tx.calibrationVolumeResult.findMany({ where: { calibrationSessionId: sessionId },take: 3 }),
    tx.rangeThreshold.findUniqueOrThrow({ where: { id: rangeThresholdId } }),
  ]);
  const readingsOf = (lot: CalibrationLot) => readings.filter((reading) => reading.calibrationLotId===lot.id);
  const isLotComplete = (lot: CalibrationLot) => readingsOf(lot).length===READINGS_PER_LOT;
  for (const lot of lots) {
    if (!isLotComplete(lot) || (onlyLotIds && !onlyLotIds.has(lot.id))) continue;
    await tx.calibrationLot.update({ where: { id: lot.id },data: statistics(volumesOf(readingsOf(lot)),lot.nominalVolumeUl.toString(),range.channelCount) });
  }
  const refreshed = [];
  for (const volume of volumes) {
    const pooledLots = lots.filter((lot) => lot.calibrationVolumeResultId===volume.id);
    const isAffected = !onlyLotIds || pooledLots.some((lot) => onlyLotIds.has(lot.id));
    if (!pooledLots.length || !pooledLots.every(isLotComplete) || !isAffected) { refreshed.push(volume); continue; }
    const pooled = pooledLots.flatMap(readingsOf);
    const stats = statistics(volumesOf(pooled),volume.nominalVolumeUl.toString(),range.channelCount);
    refreshed.push(await tx.calibrationVolumeResult.update({ where: { id: volume.id },data: { ...stats,readingCount: pooled.length,
      inaccuracyResult: compareLimit(stats.inaccuracyActualPct,volume.inaccuracyLimitPct.toString()),
      imprecisionResult: compareLimit(stats.imprecisionActualPct,volume.imprecisionLimitPct.toString()) } }));
  }
  return { lots,readings,volumes: refreshed };
}

function volumesOf(readings: CalibrationReading[]) { return readings.map((reading) => reading.volumeUl.toString()); }
