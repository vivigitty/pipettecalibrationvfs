import { getEnv } from './env';
import { AppError,ForbiddenError,ValidationError } from './errors';

const rate = new Map<string,{ count: number; until: number }>();
export function protectMutation(request: Request, actorId: string) {
  if (request.headers.get('origin')!==new URL(getEnv().AUTH_URL).origin) throw new ForbiddenError('Request origin is not allowed');
  const now = Date.now();
  if (rate.size>10000) for (const [key,value] of rate) if (value.until<now) rate.delete(key);
  const entry = rate.get(actorId);
  const value = entry && entry.until>now ? entry : { count: 0,until: now+60000 };
  value.count++; rate.set(actorId,value);
  if (value.count>60) throw new AppError(429,'RATE_LIMITED','Too many writes; retry in a minute');
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ValidationError('Use application/json');
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('JSON body is required');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done,value } = await reader.read();
    if (done) break;
    length+=value.length;
    if (length>1048576) { await reader.cancel(); throw new AppError(413,'BODY_TOO_LARGE','Request exceeds 1 MB'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { throw new ValidationError('Invalid JSON'); }
}