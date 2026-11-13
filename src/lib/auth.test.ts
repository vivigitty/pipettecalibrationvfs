import { describe, expect, it, vi } from 'vitest';
import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock('./password-auth', () => ({ verifyPassword: vi.fn() }));
vi.mock('./access-request', () => ({ requestAccess: vi.fn() }));

import './auth';

const config = vi.mocked(NextAuth).mock.calls[0]?.[0];
if (!config || typeof config === 'function' || !config.callbacks?.jwt) {
  throw new Error('Expected a JWT callback in the NextAuth configuration');
}
const jwt = config.callbacks.jwt;

describe('JWT session lifecycle', () => {
  it('stores the verified user ID during sign-in', async () => {
    const token: JWT = {};
    const user = { id: '00000000-0000-4000-8000-000000000001' };

    expect(await Reflect.apply(jwt, undefined, [{ token, user, trigger: 'signIn' }])).toBe(token);
    expect(token.supabaseSubject).toBe(user.id);
  });

  it('preserves the existing token when a session is read without a user', async () => {
    const token: JWT = { supabaseSubject: '00000000-0000-4000-8000-000000000001' };

    expect(await Reflect.apply(jwt, undefined, [{ token }])).toBe(token);
    expect(token.supabaseSubject).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('does not invent an identity when neither the token nor the user supplies one', async () => {
    const token: JWT = {};

    expect(await Reflect.apply(jwt, undefined, [{ token }])).toBe(token);
    expect(token).toEqual({});
  });
});
