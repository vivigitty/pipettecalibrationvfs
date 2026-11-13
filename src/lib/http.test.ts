import { describe,expect,it,vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('./logger', () => ({ logger: { error: logError } }));

import { problem } from './http';

describe('Request failure diagnostics', () => {
  it('identifies interrupted transactions without exposing database internals or promising a retry is safe', async () => {
    const cause = new Prisma.PrismaClientKnownRequestError('Transaction not found',{ code: 'P2028',clientVersion: '6.19.0' });
    const response = problem(cause,'interrupted-request');
    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: 'TRANSACTION_INTERRUPTED',requestId: 'interrupted-request',
      detail: 'The database transaction was interrupted. Refresh to check whether your changes were saved before trying again.' });
    expect(logError).toHaveBeenCalledWith({ err: cause,requestId: 'interrupted-request',code: 'TRANSACTION_INTERRUPTED' },'Request transaction interrupted');
    expect(JSON.stringify(body)).not.toContain(cause.message);
  });
  it('logs the cause with the request ID without exposing internal details to the client', async () => {
    const cause = new Error('Database operation failed');
    const response = problem(cause,'test-request-id');

    expect(logError).toHaveBeenCalledWith({ err: cause,requestId: 'test-request-id',code: 'INTERNAL_ERROR' },'Request failed');
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ requestId: 'test-request-id',detail: 'Unexpected error. Contact support with the request ID.' });
    expect(JSON.stringify(body)).not.toContain(cause.message);
  });
});
