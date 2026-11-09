import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { calibrationDates } from './dates';
import { parseRange, planLots } from './range';
import { combineStatuses, compareLimit, statistics, toVolumeUl } from './statistics';
import { resolveZ } from './z-factor';

const rawGrid: unknown = parse(readFileSync('z_factors_iso8655.csv','utf8'),{ columns: true,skip_empty_lines: true });
const grid = z.array(z.object({ temperature_c: z.string(),pressure_kpa: z.string(),z_value: z.string(),source_version: z.string() })).length(217).parse(rawGrid).map((row) => ({ temperatureC: row.temperature_c,pressureKpa: row.pressure_kpa,zValue: row.z_value,sourceVersion: row.source_version }));

describe('FR-02 FR-03 FR-12 range and lot planning', () => {
  it.each(['abc', '10-', '', '10-5', '0', '0-10'])('rejects %s', (label) => { expect(() => parseRange(label, 'single')).toThrow(); });
  it('plans fixed and variable-volume lots', () => {
    expect(parseRange('50', 'eight').repeats).toBe(1);
    expect(planLots('10-100', 'eight', false).map((lot) => lot.nominalVolumeUl)).toEqual(['10', '50', '100']);
    expect(planLots('10-100', 'eight', true)).toHaveLength(24);
    expect(planLots('10-100', 'twelve', true)).toHaveLength(36);
    expect(planLots('50', 'single', false)).toHaveLength(1);
  });
});

describe('FR-07 ISO interpolation', () => {
  it.each([['20', '1000', '1.0028'], ['15', '800', '1.0017'], ['30', '1050', '1.0054'], ['29.4', '1008.8', '1.0052']])('resolves %s C / %s hPa', (temp, pressure, expected) => { expect(resolveZ(grid, temp, pressure).zCorrectionValue).toBe(expected); });
  it.each([['14.9', '1000'], ['30.1', '1000'], ['20', '790'], ['20', '1060']])('rejects outside ISO range', (temp, pressure) => { expect(() => resolveZ(grid, temp, pressure)).toThrow('Z_OUT_OF_RANGE'); });
});

describe('FR-13 FR-14 golden certificate statistics', () => {
  it.each([
    ['2', Array<string>(10).fill('0.0020'), '0.5200', '0.0000'],
    ['10', ['0.0100','0.0099','0.0100','0.0100','0.0100','0.0099','0.0100','0.0100','0.0099','0.0100'], '0.2184', '0.4845'],
    ['20', ['0.0200','0.0200','0.0199','0.0200','0.0200','0.0199','0.0200','0.0200','0.0200','0.0199'], '0.3692', '0.2419'],
  ])('reproduces %s uL', async (nominal, masses, inaccuracy, imprecision) => {
    const { default: Decimal } = await import('decimal.js');
    const result = statistics(masses.map((mass) => toVolumeUl(mass, '1.0052')), nominal);
    expect(new Decimal(result.inaccuracyActualPct).toFixed(4)).toBe(inaccuracy);
    expect(new Decimal(result.imprecisionActualPct).toFixed(4)).toBe(imprecision);
  });
  it('preserves volume precision', () => { expect(toVolumeUl('0.0020', '1.0052')).toBe('2.0104'); });
  it('pools channels rather than averaging their results', () => {
    const volumes = [...Array<string>(10).fill('98'), ...Array<string>(70).fill('100')];
    expect(compareLimit(statistics(volumes, '100').inaccuracyActualPct, '1')).toBe('pass');
    expect(compareLimit(statistics(volumes.slice(0, 10), '100').inaccuracyActualPct, '1')).toBe('fail');
  });
});

describe('FR-15 inclusive limits and pending status', () => {
  it.each([['1', 'pass'], ['1.0001', 'fail'], ['-1.5', 'fail'], ['-1', 'pass']])('compares %s', (actual, expected) => { expect(compareLimit(actual, '1')).toBe(expected); });
  it('requires every volume', () => {
    expect(combineStatuses(['pass', 'pending'])).toBe('pending');
    expect(combineStatuses(['pass', 'fail'])).toBe('fail');
    expect(combineStatuses(['pass', 'pass'])).toBe('pass');
    expect(combineStatuses([])).toBe('pending');
  });
});

describe('FR-10 calendar due dates', () => {
  it.each([['2026-10-01', 12, '2027-09-30', '2027-08-31'], ['2026-11-06', 12, '2027-11-05', '2027-10-06'], ['2026-01-31', 1, '2026-02-27', '2026-01-28']])('calculates %s + %s months', (date, months, dueDate, reminderDate) => { expect(calibrationDates(date, months)).toEqual({ dueDate, reminderDate }); });
  it.each([0, 61])('rejects invalid interval %s', (months) => { expect(() => calibrationDates('2026-10-01', months)).toThrow(); });
});