import { z } from 'zod';

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(1024) });
const signupSchema = z.object({ email: z.email(), password: z.string().min(12).max(128) });
const identitySchema = z.object({ user: z.object({ id: z.uuid(), email: z.email(), email_confirmed_at: z.string().min(1) }) });

export async function registerAccount(credentials: unknown) {
  const parsed = signupSchema.safeParse(credentials);
  if (!parsed.success) return false;
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
  return response.ok;
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
  if (!response.ok) return null;
  const identity = identitySchema.safeParse(await response.json());
  if (!identity.success) return null;
  return { id: identity.data.user.id, email: identity.data.user.email };
}