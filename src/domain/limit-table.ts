import Decimal from 'decimal.js';

const Measurement = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

/** Limits (%) at a setting of 100, 50 and 10 percent of the nominal volume. */
type PointLimits = Record<100 | 50 | 10, { systematicPct: string; randomPct: string }>;
/** A nominal-volume band: above `aboveUl` (or from `fromUl` inclusive) up to and including `toUl`. */
type Band = { fromUl?: string; aboveUl?: string; toUl: string; limits: PointLimits };

const limits = (rows: [string,string,string,string,string,string]): PointLimits => ({
  100: { systematicPct: rows[0], randomPct: rows[1] },
  50: { systematicPct: rows[2], randomPct: rows[3] },
  10: { systematicPct: rows[4], randomPct: rows[5] },
});

/**
 * Reference limit tables (VFL / Surendar) used to pre-fill a new range configuration:
 * ISO 8655-2 Table 1 (single channel) and Table 2 (multi channel), types A and D1.
 * A band applies to the pipette's nominal (maximum) volume; the row is the test point's setting.
 */
export const LIMIT_TABLE_SOURCE = 'ISO 8655-2 Tables 1 and 2';

const SINGLE_CHANNEL: Band[] = [
  { fromUl: '1', toUl: '3', limits: limits(['2.5','2.0','5.0','4.0','25','20']) },
  { aboveUl: '3', toUl: '5', limits: limits(['2.5','1.5','5.0','3.0','25','15']) },
  { aboveUl: '5', toUl: '10', limits: limits(['1.2','0.8','2.4','1.6','12','8.0']) },
  { aboveUl: '10', toUl: '50', limits: limits(['1.0','0.5','2.0','1.0','10','5.0']) },
  { aboveUl: '50', toUl: '5000', limits: limits(['0.80','0.30','1.6','0.60','8.0','3.0']) },
  { aboveUl: '5000', toUl: '20000', limits: limits(['0.60','0.30','1.2','0.60','6.0','3.0']) },
];

const MULTI_CHANNEL: Band[] = [
  { fromUl: '2', toUl: '2', limits: limits(['8.0','8.0','16','16','25','25']) },
  { aboveUl: '2', toUl: '5', limits: limits(['5.0','3.0','10','6.0','25','25']) },
  { aboveUl: '5', toUl: '10', limits: limits(['2.4','1.6','4.8','3.2','24','16']) },
  { aboveUl: '10', toUl: '20', limits: limits(['2.0','1.0','4.0','2.0','20','10']) },
  { aboveUl: '20', toUl: '50', limits: limits(['2.0','0.80','4.0','1.6','20','8.0']) },
  { aboveUl: '50', toUl: '2000', limits: limits(['1.6','0.60','3.2','1.2','16','6.0']) },
];

export type SuggestedLimit = { inaccuracyLimitPct: string; imprecisionLimitPct: string };

const normalize = (value: string) => new Measurement(value).toString();

/**
 * Table limits for one test volume of a pipette with the given nominal (maximum) volume, or null when the
 * nominal volume is outside the table, or the test volume is not exactly 100, 50 or 10 percent of it
 * (for example a 10% point raised to the range minimum). Null points are entered manually.
 */
export function suggestLimit(maxUl: Decimal.Value, testVolumeUl: Decimal.Value, channelCount: number): SuggestedLimit | null {
  const max = new Measurement(maxUl);
  const volume = new Measurement(testVolumeUl);
  if (max.lte(0) || volume.lte(0)) return null;
  const band = (channelCount > 1 ? MULTI_CHANNEL : SINGLE_CHANNEL).find((candidate) =>
    (candidate.fromUl ? max.gte(candidate.fromUl) : max.gt(candidate.aboveUl ?? '0')) && max.lte(candidate.toUl));
  if (!band) return null;
  const setting = volume.div(max).mul(100);
  const point = ([100,50,10] as const).find((pct) => setting.eq(pct));
  if (!point) return null;
  const row = band.limits[point];
  return { inaccuracyLimitPct: normalize(row.systematicPct), imprecisionLimitPct: normalize(row.randomPct) };
}
