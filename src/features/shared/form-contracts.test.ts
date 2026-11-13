import { afterEach,describe,expect,it,vi } from 'vitest';
import { rangeSchema } from '../../schemas/resources';
import { api } from './api';

describe('FR-04 strict limit-update contracts', () => {
  const limits = [{ testPointPct: 100,inaccuracyLimitPct: '1',imprecisionLimitPct: '0.5' }];
  it('accepts only the explicit limit payload', () => { expect(rangeSchema.pick({ limits: true }).safeParse({ limits }).success).toBe(true); });
  it('rejects configuration identity changes through limit updates', () => { expect(rangeSchema.pick({ limits: true }).safeParse({ limits,rangeLabel: '100' }).success).toBe(false); });
});

describe('Request failure messages', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('includes the server request ID when a reading save fails', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ detail: 'Unexpected error. Contact support with the request ID.',requestId: 'reading-request-123' },{ status: 500 })));
    await expect(api('sessions/session-id/lots/1','PATCH',{ masses: Array<string>(10).fill('0.002') })).rejects.toThrow('Request ID: reading-request-123');
  });
});