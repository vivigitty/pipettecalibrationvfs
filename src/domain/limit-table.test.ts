import { describe,expect,it } from 'vitest';
import { suggestLimit } from './limit-table';
import { parseRange } from './range';

const suggestions = (label: string, channel: 'single' | 'eight') => {
  const plan = parseRange(label,channel);
  return plan.points.map((point) => suggestLimit(plan.max,point.volume,plan.channelCount));
};

describe('Reference limit table (ISO 8655-2 Tables 1 and 2)', () => {
  it('matches the VFL 2-20 uL single-channel limits at every test point', () => {
    expect(suggestions('2-20','single')).toEqual([
      { inaccuracyLimitPct: '10',imprecisionLimitPct: '5' },
      { inaccuracyLimitPct: '2',imprecisionLimitPct: '1' },
      { inaccuracyLimitPct: '1',imprecisionLimitPct: '0.5' },
    ]);
  });

  it('uses the single-channel > 50 to 5 000 uL band', () => {
    expect(suggestions('100-1000','single')).toEqual([
      { inaccuracyLimitPct: '8',imprecisionLimitPct: '3' },
      { inaccuracyLimitPct: '1.6',imprecisionLimitPct: '0.6' },
      { inaccuracyLimitPct: '0.8',imprecisionLimitPct: '0.3' },
    ]);
  });

  it('uses the multi-channel table for multi-channel pipettes', () => {
    expect(suggestions('30-300','eight')).toEqual([
      { inaccuracyLimitPct: '16',imprecisionLimitPct: '6' },
      { inaccuracyLimitPct: '3.2',imprecisionLimitPct: '1.2' },
      { inaccuracyLimitPct: '1.6',imprecisionLimitPct: '0.6' },
    ]);
    expect(suggestions('1-10','eight')).toEqual([
      { inaccuracyLimitPct: '24',imprecisionLimitPct: '16' },
      { inaccuracyLimitPct: '4.8',imprecisionLimitPct: '3.2' },
      { inaccuracyLimitPct: '2.4',imprecisionLimitPct: '1.6' },
    ]);
  });

  it('treats band edges as inclusive at the top (20 uL multi-channel is in > 10 to 20)', () => {
    expect(suggestLimit('20','20',8)).toEqual({ inaccuracyLimitPct: '2',imprecisionLimitPct: '1' });
    expect(suggestLimit('50','50',8)).toEqual({ inaccuracyLimitPct: '2',imprecisionLimitPct: '0.8' });
  });

  it('leaves points for manual entry when the range or setting is not in the table', () => {
    expect(suggestLimit('5000','5000',8)).toBeNull();
    expect(suggestLimit('25000','25000',1)).toBeNull();
    // 50-200: the 10% point (20 uL) is raised to the 50 uL minimum, which is 25% of nominal
    expect(suggestions('50-200','single')[0]).toBeNull();
  });
});
