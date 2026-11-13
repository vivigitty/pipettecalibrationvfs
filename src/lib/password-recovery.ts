import { z } from 'zod';
import { getEnv } from './env';
import { logger } from './logger';
import { newPasswordSchema } from './password-auth';

export const RECOVERY_COOKIE_NAME = 'vfl-password-recovery';
export const RECOVERY_MAX_AGE = 15 * 60;
export const recoveryTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,2048}$/);
const accessTokenSchema = z.string().max(8192).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const recoverySessionSchema = z.object({
  access_token: accessTokenSchema,
  expires_in: z.number().int().positive(),
  token_type: z.literal('bearer'),
  user: z.object({ id: z.uuid() }),
});
const resetSchema = z.strictObject({ password: newPasswordSchema,confirmation: newPasswordSchema })
  .refine((value) => value.password===value.confirmation,'Passwords must match');

export class PasswordRecoveryError extends Error {
  constructor(public readonly code: 'preview' | 'invalid' | 'password' | 'rate_limit' | 'unavailable') {
    super('Password recovery could not be completed');
  }
}

function configuration() {
  let env: ReturnType<typeof getEnv>;
  try { env = getEnv(); } catch {
    logger.error({ code: 'RECOVERY_CONFIG_INVALID' },'Password recovery configuration is invalid');
    throw new PasswordRecoveryError('unavailable');
  }
  if (env.APP_MODE!=='live') throw new PasswordRecoveryError('preview');
  const { SUPABASE_URL: url,SUPABASE_PUBLISHABLE_KEY: key } = env;
  if (!url || !key || (env.NODE_ENV==='production' && new URL(env.AUTH_URL).protocol!=='https:')) {
    logger.error({ code: 'RECOVERY_CONFIG_INVALID' },'Password recovery requires Supabase configuration and an HTTPS production AUTH_URL');
    throw new PasswordRecoveryError('unavailable');
  }
  return { url,key };
}

async function authRequest(action: 'recover' | 'verify' | 'user',body: unknown,accessToken?: string) {
  const config = configuration();
  const endpoint = new URL(`/auth/v1/${action}`,config.url);
  let response: Response;
  try {
    response = await fetch(endpoint,{
      method: action==='user' ? 'PUT' : 'POST',
      headers: { apikey: config.key,'Content-Type': 'application/json',...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),cache: 'no-store',signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    logger.error({ err: error,code: 'RECOVERY_TRANSPORT_FAILED',action },'Password recovery service is unavailable');
    throw new PasswordRecoveryError('unavailable');
  }
  if (!response.ok) {
    logger.warn({ code: 'RECOVERY_REQUEST_REJECTED',action,status: response.status },'Password recovery request rejected');
    if (response.status===429) throw new PasswordRecoveryError('rate_limit');
    if ((action==='verify' && [400,401,403,422].includes(response.status)) || (action==='user' && [401,403].includes(response.status))) throw new PasswordRecoveryError('invalid');
    if (action==='user' && [400,422].includes(response.status)) throw new PasswordRecoveryError('password');
    throw new PasswordRecoveryError('unavailable');
  }
  return response;
}

export async function requestPasswordReset(raw: unknown) {
  const email = z.email().parse(typeof raw==='string' ? raw.trim() : raw);
  await authRequest('recover',{ email });
}

export async function verifyPasswordRecovery(raw: unknown) {
  const tokenHash = recoveryTokenSchema.parse(raw);
  const response = await authRequest('verify',{ token_hash: tokenHash,type: 'recovery' });
  let data: unknown;
  try { data = await response.json(); } catch {
    logger.error({ code: 'RECOVERY_INVALID_RESPONSE' },'Password recovery returned an invalid session');
    throw new PasswordRecoveryError('unavailable');
  }
  const parsed = recoverySessionSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({ code: 'RECOVERY_INVALID_RESPONSE' },'Password recovery returned an invalid session');
    throw new PasswordRecoveryError('unavailable');
  }
  return { accessToken: parsed.data.access_token,maxAge: Math.min(parsed.data.expires_in,RECOVERY_MAX_AGE) };
}

export async function updateRecoveredPassword(accessToken: string,raw: unknown) {
  if (!accessTokenSchema.safeParse(accessToken).success) throw new PasswordRecoveryError('invalid');
  const { password } = resetSchema.parse(raw);
  await authRequest('user',{ password },accessToken);
}
