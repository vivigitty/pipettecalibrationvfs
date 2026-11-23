import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAccount, resendConfirmation, UnconfirmedEmailError, verifyPassword } from './password-auth';

const request = vi.fn();
const userId = '00000000-0000-4000-8000-000000000001';

describe('Supabase password verification', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-key');
    request.mockReset();
    vi.stubGlobal('fetch', request);
  });
  it('rejects invalid input without calling Supabase', async () => {
    expect(await verifyPassword({ email: 'invalid', password: '' })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects short signup passwords before calling Supabase', async () => {
    expect(await registerAccount({ email: 'person@gmail.com', password: 'short' })).toEqual({ isAccepted: false, identity: null });
    expect(request).not.toHaveBeenCalled();
  });
  it('allows any email provider without sending roles or approval flags', async () => {
    vi.stubEnv('AUTH_URL', 'http://127.0.0.1:3000');
    request.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await registerAccount({ email: 'person@gmail.com', password: 'long-test-password', role: 'admin', isActive: true })).toEqual({ isAccepted: true, identity: null });
    expect(request).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ body: JSON.stringify({ email: 'person@gmail.com', password: 'long-test-password' }), cache: 'no-store' }),
    );
  });
  it('handles signup rejections without returning provider details', async () => {
    request.mockResolvedValue(new Response('{}', { status: 429 }));
    expect(await registerAccount({ email: 'person@gmail.com', password: 'long-test-password' })).toEqual({ isAccepted: false, identity: null });
  });
  it('returns the pending identity so the access request can be filed at signup', async () => {
    request.mockResolvedValue(Response.json({ id: userId, email: 'person@gmail.com', identities: [{ id: 'identity' }] }));
    expect(await registerAccount({ email: 'person@gmail.com', password: 'long-test-password' })).toEqual({ isAccepted: true, identity: { id: userId, email: 'person@gmail.com' } });
  });
  it('reads the identity from an auto-confirmed signup session', async () => {
    request.mockResolvedValue(Response.json({ access_token: 'token', user: { id: userId, email: 'person@gmail.com' } }));
    expect((await registerAccount({ email: 'person@gmail.com', password: 'long-test-password' })).identity).toEqual({ id: userId, email: 'person@gmail.com' });
  });
  it('does not file a request for an already-registered address (obfuscated response)', async () => {
    request.mockResolvedValue(Response.json({ id: userId, email: 'person@gmail.com', identities: [] }));
    expect(await registerAccount({ email: 'person@gmail.com', password: 'long-test-password' })).toEqual({ isAccepted: true, identity: null });
  });
  it('rejects invalid credentials', async () => {
    request.mockResolvedValue(new Response('{}', { status: 400 }));
    expect(await verifyPassword({ email: 'lab@example.org', password: 'wrong-password' })).toBeNull();
  });
  it('rejects unconfirmed email accounts', async () => {
    request.mockResolvedValue(Response.json({ user: { id: userId, email: 'lab@example.org' } }));
    expect(await verifyPassword({ email: 'lab@example.org', password: 'test-password' })).toBeNull();
  });
  it('reports an unconfirmed address separately from a wrong password', async () => {
    request.mockResolvedValue(Response.json({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, { status: 400 }));
    await expect(verifyPassword({ email: 'lab@example.org', password: 'test-password' })).rejects.toBeInstanceOf(UnconfirmedEmailError);
  });
  it('requests a new signup confirmation email', async () => {
    request.mockResolvedValue(Response.json({}));
    expect(await resendConfirmation('lab@example.org')).toBe('sent');
    expect(request).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ body: JSON.stringify({ type: 'signup', email: 'lab@example.org' }) }));
  });
  it('reports throttled resend requests and rejects invalid addresses without calling Supabase', async () => {
    expect(await resendConfirmation('not-an-email')).toBe('invalid');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(new Response('{}', { status: 429 }));
    expect(await resendConfirmation('lab@example.org')).toBe('rate_limit');
  });
  it('returns the verified Supabase identity', async () => {
    request.mockResolvedValue(Response.json({ user: { id: userId, email: 'lab@example.org', email_confirmed_at: '2026-11-10' } }));
    expect(await verifyPassword({ email: 'lab@example.org', password: 'test-password' })).toEqual({ id: userId, email: 'lab@example.org' });
  });
});