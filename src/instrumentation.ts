export async function register() {
  if (process.env.NEXT_RUNTIME!=='nodejs') return;
  const { getEnv } = await import('./lib/env');
  const env = getEnv();
  if (env.NODE_ENV==='production' && env.APP_MODE==='live') {
    const { db } = await import('./lib/db');
    const unverified = await db.zFactorReference.count({ where: { sourceVersion: { contains: 'UNVERIFIED' } } });
    const count = await db.zFactorReference.count({ where: { sourceVersion: env.Z_SOURCE_VERSION } });
    if (unverified>0 || count!==217) throw new Error('Production requires a verified 217-row ISO reference table');
  }
}