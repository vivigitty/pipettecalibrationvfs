import { describe,expect,it } from 'vitest';
import { rangeSchema } from '../../schemas/resources';

describe('FR-04 strict limit-update contracts', () => {
  const limits = [{ testPointPct: 100,inaccuracyLimitPct: '1',imprecisionLimitPct: '0.5' }];
  it('accepts only the explicit limit payload', () => { expect(rangeSchema.pick({ limits: true }).safeParse({ limits }).success).toBe(true); });
  it('rejects configuration identity changes through limit updates', () => { expect(rangeSchema.pick({ limits: true }).safeParse({ limits,rangeLabel: '100' }).success).toBe(false); });
});