import { z } from 'zod';
import { parseRange } from '@/domain/range';
import { calibrationDates } from '@/domain/dates';
import { resolveZ } from '@/domain/z-factor';
import { loadIsoGrid } from '@/lib/iso-grid';
import { getEnv } from '@/lib/env';
import { inventoryDb } from '@/repositories/inventory';
import type { Actor } from '@/lib/rbac';
import { ValidationError } from '@/lib/errors';

export async function derivePreview(actor: Actor, resource: string, raw: unknown) {
  try {
    if (resource==='range-plan') {
      const input = z.object({ rangeLabel: z.string().max(30),channel: z.enum(['single','eight','twelve']) }).parse(raw);
      const plan = parseRange(input.rangeLabel,input.channel);
      return { timesToTest: plan.timesToTest,repeats: plan.repeats,points: plan.points.map((point) => ({ pct: point.pct,volume: point.volume.toString() })) };
    }
    if (resource==='dates') {
      const input = z.object({ processDate: z.iso.date(),months: z.coerce.number().int().min(1).max(60) }).parse(raw);
      return calibrationDates(input.processDate,input.months);
    }
    const input = z.object({ temperature: z.string().max(30),pressure: z.string().max(30) }).parse(raw);
    const grid = actor.isPreview ? (await loadIsoGrid()).map((row) => ({ temperatureC: row.temperature_c,pressureKpa: row.pressure_kpa,zValue: row.z_value,sourceVersion: row.source_version })) : (await inventoryDb.zFactorReference.findMany({ where: { sourceVersion: getEnv().Z_SOURCE_VERSION } })).map((row) => ({ temperatureC: row.temperatureC.toString(),pressureKpa: row.pressureKpa.toString(),zValue: row.zValue.toString(),sourceVersion: row.sourceVersion }));
    return resolveZ(grid,input.temperature,input.pressure);
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new ValidationError('Unable to derive values; check the input and reference data');
  }
}