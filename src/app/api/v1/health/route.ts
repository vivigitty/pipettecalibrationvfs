import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';

export async function GET() {
  try {
    const env = getEnv();
    if (env.APP_MODE==='preview') return Response.json({ status: 'preview',database: 'not-connected',certificates: 'ephemeral-download-only' });
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok',certificates: 'ephemeral-download-only' });
  } catch { return Response.json({ status: 'unavailable' }, { status: 503 }); }
}