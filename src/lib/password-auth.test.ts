import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAccount, verifyPassword } from './password-auth';

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
    expect(await registerAccount({ email: 'person@gmail.com', password: 'short' })).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it('allows any email provider without sending roles or approval flags', async () => {
    vi.stubEnv('AUTH_URL', 'http://127.0.0.1:3000');
    request.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await registerAccount({ email: 'person@gmail.com', password: 'long-test-password', role: 'admin', isActive: true })).toBe(true);
    expect(request).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ body: JSON.stringify({ email: 'person@gmail.com', password: 'long-test-password' }), cache: 'no-store' }),
    );
  });
  it('handles signup rejections without returning provider details', async () => {
    request.mockResolvedValue(new Response('{}', { status: 429 }));
    expect(await registerAccount({ email: 'person@gmail.com', password: 'long-test-password' })).toBe(false);
  });
  it('rejects invalid credentials', async () => {
    request.mockResolvedValue(new Response('{}', { status: 400 }));
    expect(await verifyPassword({ email: 'lab@example.org', password: 'wrong-password' })).toBeNull();
  });
  it('rejects unconfirmed email accounts', async () => {
    request.mockResolvedValue(Response.json({ user: { id: userId, email: 'lab@example.org' } }));
    expect(await verifyPassword({ email: 'lab@example.org', password: 'test-password' })).toBeNull();
  });
  it('returns the verified Supabase identity', async () => {
    request.mockResolvedValue(Response.json({ user: { id: userId, email: 'lab@example.org', email_confirmed_at: '2026-11-10' } }));
    expect(await verifyPassword({ email: 'lab@example.org', password: 'test-password' })).toEqual({ id: userId, email: 'lab@example.org' });
  });
});