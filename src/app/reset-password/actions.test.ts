import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';

const { getCookie,setCookie,requestResetEmail,verifyRecovery,updatePassword } = vi.hoisted(() => ({
  getCookie: vi.fn(),setCookie: vi.fn(),requestResetEmail: vi.fn(),verifyRecovery: vi.fn(),updatePassword: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: getCookie,set: setCookie }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(),warn: vi.fn() } }));
vi.mock('@/lib/password-recovery', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/password-recovery')>(),
  requestPasswordReset: requestResetEmail,verifyPasswordRecovery: verifyRecovery,updateRecoveredPassword: updatePassword,
}));

import { PasswordRecoveryError } from '@/lib/password-recovery';
import { changePassword,confirmResetLink,requestReset } from './actions';

const token = 'header.payload.signature';

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('NODE_ENV','production'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('Password recovery actions', () => {
  it('returns a non-enumerating acknowledgement after a reset email request', async () => {
    const form = new FormData();
    form.set('email','person@example.org');
    await expect(requestReset(form)).rejects.toThrow('REDIRECT:/forgot-password?sent=1');
    expect(requestResetEmail).toHaveBeenCalledWith('person@example.org');
  });

  it('keeps the recovery token in a secure, short-lived, path-scoped HttpOnly cookie', async () => {
    verifyRecovery.mockResolvedValue({ accessToken: token,maxAge: 900 });
    const form = new FormData();
    form.set('token_hash','a'.repeat(64));
    await expect(confirmResetLink(form)).rejects.toThrow('REDIRECT:/reset-password');
    expect(setCookie).toHaveBeenLastCalledWith('vfl-password-recovery',token,{ httpOnly: true,secure: true,sameSite: 'strict',path: '/reset-password',maxAge: 900 });
  });

  it('clears any old reset session when the new email link is invalid', async () => {
    verifyRecovery.mockRejectedValue(new PasswordRecoveryError('invalid'));
    await expect(confirmResetLink(new FormData())).rejects.toThrow('REDIRECT:/forgot-password?error=invalid');
    expect(setCookie).toHaveBeenCalledOnce();
    expect(setCookie).toHaveBeenCalledWith('vfl-password-recovery','',expect.objectContaining({ path: '/reset-password',maxAge: 0 }));
  });

  it('does not attempt a password change without a recovery cookie', async () => {
    await expect(changePassword(new FormData())).rejects.toThrow('REDIRECT:/forgot-password?error=invalid');
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('clears the reset session and returns to login after changing the password', async () => {
    getCookie.mockReturnValue({ value: token });
    const form = new FormData();
    form.set('password','a-new-long-password');
    form.set('confirmation','a-new-long-password');
    await expect(changePassword(form)).rejects.toThrow('REDIRECT:/login?reset=1');
    expect(updatePassword).toHaveBeenCalledWith(token,{ password: 'a-new-long-password',confirmation: 'a-new-long-password' });
    expect(setCookie).toHaveBeenCalledWith('vfl-password-recovery','',expect.objectContaining({ path: '/reset-password',maxAge: 0 }));
  });

  it('clears expired reset authorization instead of leaving a retryable session', async () => {
    getCookie.mockReturnValue({ value: token });
    updatePassword.mockRejectedValue(new PasswordRecoveryError('invalid'));
    await expect(changePassword(new FormData())).rejects.toThrow('REDIRECT:/forgot-password?error=invalid');
    expect(setCookie).toHaveBeenCalledWith('vfl-password-recovery','',expect.objectContaining({ maxAge: 0 }));
  });
});
