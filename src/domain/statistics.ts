import Decimal from 'decimal.js';

const Measurement = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

/** FR-13: mass in grams multiplied by the resolved Z and 1000 gives microlitres. */
export function toVolumeUl(mass: string, z: string) {
  const value = new Measurement(mass);
  if (!value.isFinite() || value.lte(0)) throw new Error('Mass must be positive');
  return value.mul(z).mul(1000).toString();
}

/** FR-14: sample SD and signed inaccuracy; pool ALL readings of a volume. */
export function statistics(volumes: string[], nominal: string) {
  if (volumes.length < 2) throw new Error('At least two readings are required');
  const values = volumes.map((value) => new Measurement(value));
  if (values.some((value) => !value.isFinite() || value.lte(0))) throw new Error('Volumes must be positive finite decimals');
  const mean = values.reduce((total, value) => total.add(value), new Measurement(0)).div(values.length);
  if (mean.lte(0) || new Measurement(nominal).lte(0)) throw new Error('Volumes must be positive');
  const variance = values.reduce((total, value) => total.add(value.sub(mean).pow(2)), new Measurement(0)).div(values.length - 1);
  const sd = variance.sqrt();
  return { meanVolumeUl: mean.toString(), stdDevUl: sd.toString(),
    inaccuracyActualPct: mean.sub(nominal).div(nominal).mul(100).toString(),
    imprecisionActualPct: sd.div(mean).mul(100).toString() };
}

/** FR-15: inclusive limits; signed inaccuracy is compared by magnitude. */
export function compareLimit(actual: string, limit: string): 'pass' | 'fail' {
  return new Measurement(actual).abs().lte(limit) ? 'pass' : 'fail';
}

export function combineStatuses(statuses: ('pending' | 'pass' | 'fail')[]): 'pending' | 'pass' | 'fail' {
  if (statuses.length === 0 || statuses.includes('pending')) return 'pending';
  return statuses.includes('fail') ? 'fail' : 'pass';
}