import Decimal from 'decimal.js';
const Measurement = Decimal.clone({ precision: 50 });

type GridRow = { temperatureC: string; pressureKpa: string; zValue: string; sourceVersion: string };

function bracket(values: Decimal[], target: Decimal) {
  const sorted = values.sort((left, right) => left.comparedTo(right));
  const lower = sorted.filter((value) => value.lte(target)).at(-1);
  const upper = sorted.find((value) => value.gte(target));
  if (!lower || !upper) throw new Error('Z_OUT_OF_RANGE');
  return [lower, upper] as const;
}

function interpolate(low: Decimal, high: Decimal, start: Decimal, end: Decimal, target: Decimal) {
  return start.eq(end) ? low : low.add(high.sub(low).mul(target.sub(start)).div(end.sub(start)));
}

/** FR-07: bilinear interpolation, hPa / 10 to kPa; only Z is rounded (4 dp). */
export function resolveZ(grid: GridRow[], temperature: string, pressureHpa: string) {
  const temp = new Measurement(temperature);
  const pressure = new Measurement(pressureHpa).div(10);
  if (!temp.isFinite() || !pressure.isFinite() || temp.lt(15) || temp.gt(30) || pressure.lt(80) || pressure.gt(105)) throw new Error('Z_OUT_OF_RANGE');
  const versions = new Set(grid.map((row) => row.sourceVersion));
  if (versions.size !== 1) throw new Error('One ISO source version must be selected');
  const [tempLow, tempHigh] = bracket(grid.map((row) => new Measurement(row.temperatureC)), temp);
  const [pressLow, pressHigh] = bracket(grid.map((row) => new Measurement(row.pressureKpa)), pressure);
  const corner = (water: Decimal, air: Decimal) => {
    const row = grid.find((point) => water.eq(point.temperatureC) && air.eq(point.pressureKpa));
    if (!row) throw new Error('Incomplete ISO grid');
    return new Measurement(row.zValue);
  };
  const lower = interpolate(corner(tempLow, pressLow), corner(tempLow, pressHigh), pressLow, pressHigh, pressure);
  const upper = interpolate(corner(tempHigh, pressLow), corner(tempHigh, pressHigh), pressLow, pressHigh, pressure);
  return { zCorrectionValue: interpolate(lower, upper, tempLow, tempHigh, temp).toFixed(4), sourceVersion: grid[0]?.sourceVersion ?? '' };
}