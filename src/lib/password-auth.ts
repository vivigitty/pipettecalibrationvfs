import { z } from 'zod';

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(1024) });
export const newPasswordSchema = z.string().min(12).max(128);
const signupSchema = z.object({ email: z.email(), password: newPasswordSchema });
/** Supabase rejects a correct password with this code while the address is unconfirmed. */
export class UnconfirmedEmailError extends Error {
  constructor() { super('Email not confirmed'); }
}
const authFailureSchema = z.object({ error_code: z.string().optional(), error_description: z.string().optional(), msg: z.string().optional() });
const isUnconfirmed = (body: unknown) => {
  const failure = authFailureSchema.safeParse(body);
  if (!failure.success) return false;
  const { error_code: code, error_description: description, msg } = failure.data;
  return code === 'email_not_confirmed' || [description, msg].some((text) => text?.toLowerCase().includes('email not confirmed'));
};
const identitySchema = z.object({ user: z.object({ id: z.uuid(), email: z.email(), email_confirmed_at: z.string().min(1) }) });

/**
 * Supabase returns the pending user (no session) while email confirmation is on, or a session wrapping the user when
 * auto-confirm is on. For an address that is already registered it returns an obfuscated user with no identities,
 * which must not create an access request.
 */
const signupUserSchema = z.object({ id: z.uuid(), email: z.email(), identities: z.array(z.unknown()).optional() });
const signupResponseSchema = z.union([z.object({ user: signupUserSchema }), signupUserSchema.transform((user) => ({ user }))]);

export type SignupResult = { isAccepted: boolean; identity: { id: string; email: string } | null };

export async function registerAccount(credentials: unknown): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(credentials);
  if (!parsed.success) return { isAccepted: false, identity: null };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase authentication is not configured');
  const endpoint = new URL('/auth/v1/signup', url);
  endpoint.searchParams.set('redirect_to', new URL('/login', process.env.AUTH_URL ?? 'http://127.0.0.1:3000').toString());
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return { isAccepted: false, identity: null };
  const body = signupResponseSchema.safeParse(await response.json().catch(() => null));
  const user = body.success ? body.data.user : null;
  const isNewIdentity = Boolean(user && (user.identities === undefined || user.identities.length > 0));
  return { isAccepted: true, identity: user && isNewIdentity ? { id: user.id, email: user.email } : null };
}

export async function verifyPassword(credentials: unknown) {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase authentication is not configured');
  const response = await fetch(new URL('/auth/v1/token?grant_type=password', url), {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    if (isUnconfirmed(await response.json().catch(() => null))) throw new UnconfirmedEmailError();
    return null;
  }
  const identity = identitySchema.safeParse(await response.json());
  if (!identity.success) return null;
  return { id: identity.data.user.id, email: identity.data.user.email };
}
/**
 * Asks Supabase to send the signup confirmation email again. Returns 'rate_limit' when Supabase throttles the request;
 * otherwise 'sent', without revealing whether the address has an unconfirmed account.
 */
export async function resendConfirmation(email: unknown): Promise<'sent' | 'invalid' | 'rate_limit'> {
  const parsed = z.email().safeParse(email);
  if (!parsed.success) return 'invalid';
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase authentication is not configured');
  const endpoint = new URL('/auth/v1/resend', url);
  endpoint.searchParams.set('redirect_to', new URL('/login', process.env.AUTH_URL ?? 'http://127.0.0.1:3000').toString());
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'signup', email: parsed.data }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  return response.status === 429 ? 'rate_limit' : 'sent';
}
