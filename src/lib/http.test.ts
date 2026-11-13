import { describe,expect,it,vi } from 'vitest';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('./logger', () => ({ logger: { error: logError } }));

import { problem } from './http';

describe('Request failure diagnostics', () => {
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
