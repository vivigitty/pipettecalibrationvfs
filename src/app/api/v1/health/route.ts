import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { checkStorage } from '@/lib/storage';

export async function GET() {
  try {
    const env = getEnv();
    if (env.APP_MODE==='preview') return Response.json({ status: 'preview',database: 'not-connected',storage: 'not-connected' });
    await db.$queryRaw`SELECT 1`;
    await checkStorage();
    return Response.json({ status: 'ok' });
  } catch { return Response.json({ status: 'unavailable' }, { status: 503 }); }
}