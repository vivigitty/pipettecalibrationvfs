import type { Prisma } from '@prisma/client';
import { getEnv } from '@/lib/env';
import { BusinessRuleError } from '@/lib/errors';
import { db } from '@/lib/db';

/**
 * FR-07: loads the ISO Z grid for the configured source version. An empty result almost always means
 * Z_SOURCE_VERSION does not match the labels stored in z_factor_references, so say that instead of a generic failure.
 */
export async function loadZGrid(client: Prisma.TransactionClient = db) {
  const version = getEnv().Z_SOURCE_VERSION;
  const rows = await client.zFactorReference.findMany({ where: { sourceVersion: version } });
  if (rows.length===0) throw new BusinessRuleError('Z_REFERENCE_MISSING',`No ISO Z reference rows found for source version "${version}". Set Z_SOURCE_VERSION to the version stored in the z_factor_references table.`);
  return rows.map((row) => ({ temperatureC: row.temperatureC.toString(),pressureKpa: row.pressureKpa.toString(),zValue: row.zValue.toString(),sourceVersion: row.sourceVersion }));
}
