import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const { construct } = vi.hoisted(() => ({ construct: vi.fn<(options: { datasourceUrl?: string }) => void>() }));
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function(options: { datasourceUrl?: string }) { construct(options); }),
}));

const globalDb = globalThis as typeof globalThis & { vflDb?: PrismaClient };
beforeEach(() => {
  vi.resetModules();
  construct.mockClear();
  delete globalDb.vflDb;
});
afterEach(() => {
  delete globalDb.vflDb;
  vi.unstubAllEnvs();
});

describe('Runtime database connection budget', () => {
  it('limits each client to one connection while preserving pooler credentials and settings', async () => {
    vi.stubEnv('DATABASE_URL','postgresql://app.project:p%40ss@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require');
    await import('./db');
    const url = new URL(construct.mock.calls[0]?.[0].datasourceUrl ?? '');
    expect(url.searchParams.get('connection_limit')).toBe('1');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.password).toBe('p%40ss');
    expect(url.port).toBe('6543');
  });

  it('preserves an explicitly tuned connection limit', async () => {
    vi.stubEnv('DATABASE_URL','postgresql://app:password@localhost:5432/postgres?connection_limit=2');
    await import('./db');
    const url = new URL(construct.mock.calls[0]?.[0].datasourceUrl ?? '');
    expect(url.searchParams.get('connection_limit')).toBe('2');
  });

  it('reuses the client across production module reloads instead of opening another pool', async () => {
    vi.stubEnv('NODE_ENV','production');
    vi.stubEnv('DATABASE_URL','postgresql://app:password@localhost:5432/postgres');
    const first = await import('./db');
    vi.resetModules();
    const second = await import('./db');
    expect(second.db).toBe(first.db);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('still permits read-only preview initialization without a database URL', async () => {
    vi.stubEnv('DATABASE_URL',undefined);
    await import('./db');
    expect(construct).toHaveBeenCalledWith({});
  });

  it('rejects malformed configuration without including credentials in the error', async () => {
    vi.stubEnv('DATABASE_URL','postgresql://app:private-password@invalid host/postgres');
    await expect(import('./db')).rejects.toThrow('DATABASE_URL must be a valid PostgreSQL connection URL');
    expect(construct).not.toHaveBeenCalled();
  });
});
