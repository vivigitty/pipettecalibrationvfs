import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock('./db', () => ({ db: { user: { upsert } } }));
vi.mock('next-auth', async () => ({ CredentialsSignin: (await import('@auth/core/errors')).CredentialsSignin }));
import { requestAccess } from './access-request';

const identity = { id: '00000000-0000-4000-8000-000000000001', email: 'person@example.org' };

describe('Verified signup access requests', () => {
  beforeEach(() => { upsert.mockReset(); });
  it('creates an inactive request with no client-supplied role', async () => {
    upsert.mockResolvedValue({ ...identity, isActive: false });
    await expect(requestAccess(identity)).rejects.toMatchObject({ code: 'approval_required' });
    expect(upsert).toHaveBeenCalledWith({
      where: { externalSubject: identity.id },
      create: { externalSubject: identity.id, email: identity.email, displayName: identity.email, role: 'executive', isActive: false },
      update: {},
    });
  });
  it('never reactivates a rejected or disabled account', async () => {
    upsert.mockResolvedValue({ ...identity, isActive: false, role: 'admin' });
    await expect(requestAccess(identity)).rejects.toMatchObject({ code: 'approval_required' });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
  it('allows an approved account with a matching email', async () => {
    upsert.mockResolvedValue({ email: 'PERSON@example.org', isActive: true, displayName: 'Lab User' });
    expect(await requestAccess(identity)).toEqual({ ...identity, name: 'Lab User' });
  });
  it('does not link identities by email', async () => {
    upsert.mockResolvedValue({ email: 'another@example.org', isActive: true });
    expect(await requestAccess(identity)).toBeNull();
  });
});