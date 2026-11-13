import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { z } from 'zod';

const { logError,logWarning } = vi.hoisted(() => ({ logError: vi.fn(),logWarning: vi.fn() }));
vi.mock('./logger', () => ({ logger: { error: logError,warn: logWarning } }));

import { requestPasswordReset,updateRecoveredPassword,verifyPasswordRecovery } from './password-recovery';

const request = vi.fn();
const tokenHash = 'a'.repeat(64);
const accessToken = 'header.payload.signature';
const password = 'a-new-long-password';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch',request);
  vi.stubEnv('NODE_ENV','test');
  vi.stubEnv('APP_MODE','live');
  vi.stubEnv('DATABASE_URL','postgresql://test:test@localhost:5432/test');
  vi.stubEnv('AUTH_SECRET','a'.repeat(32));
  vi.stubEnv('AUTH_URL','https://app.example.org');
  vi.stubEnv('SUPABASE_URL','https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','publishable-test-key');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Password recovery', () => {
  it('requests a recovery email using the shared Supabase template, not a local redirect or app role', async () => {
    vi.stubEnv('AUTH_URL','http://127.0.0.1:3000');
    request.mockResolvedValue(new Response('{}',{ status: 200 }));
    await requestPasswordReset(' person@example.org ');

    expect(request).toHaveBeenCalledWith(
      new URL('https://example.supabase.co/auth/v1/recover'),
      expect.objectContaining({ method: 'POST',body: JSON.stringify({ email: 'person@example.org' }),cache: 'no-store' }),
    );
  });

  it('rejects an invalid email before contacting Supabase', async () => {
    await expect(requestPasswordReset('invalid')).rejects.toBeInstanceOf(z.ZodError);
    expect(request).not.toHaveBeenCalled();
  });

  it('blocks recovery writes in preview', async () => {
    vi.stubEnv('APP_MODE','preview');
    await expect(requestPasswordReset('person@example.org')).rejects.toMatchObject({ code: 'preview' });
    expect(request).not.toHaveBeenCalled();
  });

  it('surfaces delivery throttling rather than reporting an email was sent', async () => {
    request.mockResolvedValue(new Response('{}',{ status: 429 }));
    await expect(requestPasswordReset('person@example.org')).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it.each([[3600,900],[60,60]])('bounds a %s-second recovery token to %s seconds without retaining the refresh token', async (expiresIn,maxAge) => {
    request.mockResolvedValue(Response.json({ access_token: accessToken,refresh_token: 'never-store-this',token_type: 'bearer',expires_in: expiresIn,user: { id: '00000000-0000-4000-8000-000000000001' } }));
    expect(await verifyPasswordRecovery(tokenHash)).toEqual({ accessToken,maxAge });
    expect(request).toHaveBeenCalledWith(new URL('https://example.supabase.co/auth/v1/verify'),expect.objectContaining({ method: 'POST',body: JSON.stringify({ token_hash: tokenHash,type: 'recovery' }) }));
  });

  it('rejects expired or already-used recovery links', async () => {
    request.mockResolvedValue(new Response('{}',{ status: 403 }));
    await expect(verifyPasswordRecovery(tokenHash)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('does not accept an invalid session or log its raw tokens', async () => {
    request.mockResolvedValue(Response.json({ access_token: 'sensitive-invalid-token' }));
    await expect(verifyPasswordRecovery(tokenHash)).rejects.toMatchObject({ code: 'unavailable' });
    expect(JSON.stringify(logError.mock.calls)).not.toContain('sensitive-invalid-token');
  });

  it('updates only the authenticated Supabase user password', async () => {
    request.mockResolvedValue(Response.json({ id: '00000000-0000-4000-8000-000000000001' }));
    await updateRecoveredPassword(accessToken,{ password,confirmation: password });
    expect(request).toHaveBeenCalledWith(new URL('https://example.supabase.co/auth/v1/user'),expect.objectContaining({
      method: 'PUT',headers: { apikey: 'publishable-test-key','Content-Type': 'application/json',Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),cache: 'no-store',
    }));
  });

  it.each([
    { password,confirmation: 'does-not-match' },
    { password: 'short',confirmation: 'short' },
    { password,confirmation: password,role: 'admin',isActive: true },
  ])('rejects invalid passwords and privilege-changing fields without a request', async (input) => {
    await expect(updateRecoveredPassword(accessToken,input)).rejects.toBeInstanceOf(z.ZodError);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an expired recovery session instead of falling back to administrator privileges', async () => {
    request.mockResolvedValue(new Response('{}',{ status: 401 }));
    await expect(updateRecoveredPassword(accessToken,{ password,confirmation: password })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('reports and logs transport failures without logging the requested email', async () => {
    request.mockRejectedValue(new Error('Connection failed'));
    await expect(requestPasswordReset('person@example.org')).rejects.toMatchObject({ code: 'unavailable' });
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ code: 'RECOVERY_TRANSPORT_FAILED',action: 'recover' }),expect.any(String));
    expect(JSON.stringify(logError.mock.calls)).not.toContain('person@example.org');
  });
});
