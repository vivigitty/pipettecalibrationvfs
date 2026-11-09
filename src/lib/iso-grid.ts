import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export const isoRowSchema = z.object({ temperature_c: z.string(),pressure_kpa: z.string(),z_value: z.string(),source_version: z.string() });
export async function loadIsoGrid() {
  const raw: unknown = parse(await readFile('z_factors_iso8655.csv','utf8'), { columns: true,skip_empty_lines: true });
  return z.array(isoRowSchema).length(217).parse(raw);
}