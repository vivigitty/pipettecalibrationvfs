import Decimal from 'decimal.js';
const Measurement = Decimal.clone({ precision: 50 });

/** FR-02, FR-03: fixed volume has one test; variable volume has three. */
export function parseRange(label: string, channel: 'single' | 'eight' | 'twelve') {
  if (!/^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(label)) throw new Error('Invalid volume range');
  const [lower, upper] = label.split('-');
  if (!lower) throw new Error('Volume range is required');
  const max = new Measurement(upper ?? lower);
  const min = upper ? new Measurement(lower) : null;
  if (max.lte(0) || (min && (min.lte(0) || min.gte(max)))) throw new Error('Invalid volume range');
  const channelCount = { single: 1, eight: 8, twelve: 12 }[channel];
  const points = min ? [10, 50, 100] : [100];
  return { min, max, channelCount, timesToTest: points.length, repeats: min ? channelCount : 1,
    points: points.map((pct) => ({ pct, volume: max.mul(pct).div(100) })) };
}

/** FR-12: one lot per volume by default, one per channel when selected. */
export function planLots(label: string, channel: 'single' | 'eight' | 'twelve', isPerChannel: boolean) {
  const range = parseRange(label, channel);
  let lotNo = 0;
  return range.points.flatMap(({ volume }) => Array.from(
    { length: isPerChannel ? range.channelCount : 1 }, (_, index) => ({
      lotNo: ++lotNo, nominalVolumeUl: volume.toString(), channelNo: isPerChannel ? index + 1 : null,
    }),
  ));
}