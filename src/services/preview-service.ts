import { z } from 'zod';
import { parseRange } from '@/domain/range';
import { LIMIT_TABLE_SOURCE,suggestLimit } from '@/domain/limit-table';
import { calibrationDates } from '@/domain/dates';
import { resolveZ } from '@/domain/z-factor';
import { loadIsoGrid } from '@/lib/iso-grid';
import { loadZGrid } from '@/repositories/z-grid';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/rbac';
import { AppError,ValidationError } from '@/lib/errors';

export async function derivePreview(actor: Actor, resource: string, raw: unknown) {
  try {
    if (resource==='range-plan') {
      const input = z.object({ rangeLabel: z.string().max(30),channel: z.enum(['single','eight','twelve','sixteen','twenty_four']) }).parse(raw);
      const plan = parseRange(input.rangeLabel,input.channel);
      const points = plan.points.map((point) => ({ pct: point.pct,volume: point.volume.toString(),suggested: suggestLimit(plan.max,point.volume,plan.channelCount) }));
      return { timesToTest: plan.timesToTest,repeats: plan.repeats,limitSource: points.some((point) => point.suggested) ? LIMIT_TABLE_SOURCE : null,points };
    }
    if (resource==='dates') {
      const input = z.object({ processDate: z.iso.date(),months: z.coerce.number().int().min(1).max(60) }).parse(raw);
      return calibrationDates(input.processDate,input.months);
    }
    const input = z.object({ temperature: z.string().max(30),pressure: z.string().max(30) }).parse(raw);
    const grid = actor.isPreview ? (await loadIsoGrid()).map((row) => ({ temperatureC: row.temperature_c,pressureKpa: row.pressure_kpa,zValue: row.z_value,sourceVersion: row.source_version })) : await loadZGrid();
    return resolveZ(grid,input.temperature,input.pressure);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof AppError) throw error;
    logger.warn({ err: error,resource },'Derived value could not be computed');
    throw new ValidationError('Unable to derive values; check the input and reference data');
  }
}