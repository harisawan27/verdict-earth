export type Interval = number[] | null;
export type Fit = { start: number; end: number; years: number[]; minimum: number; slope: number | null; intercept: number | null };

export function descriptiveFit(annual: (number | null)[], first: number, start: number, end: number, minimum: number): Fit {
  const years: number[] = [];
  const values: number[] = [];
  for (let year = start; year <= end; year++) {
    const value = annual[year - first];
    if (typeof value === "number" && Number.isFinite(value)) {
      years.push(year);
      values.push(value);
    }
  }
  if (years.length < Math.max(2, minimum)) return { start, end, years, minimum, slope: null, intercept: null };
  const meanYear = years.reduce((sum, year) => sum + year, 0) / years.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = years.reduce((sum, year) => sum + (year - meanYear) ** 2, 0);
  const slope = 10 * years.reduce((sum, year, index) => sum + (year - meanYear) * (values[index] - mean), 0) / spread;
  return { start, end, years, minimum, slope, intercept: mean + (start - meanYear) * slope / 10 };
}

type Verdict = { label: string; reason: string };
function direction(value: number) {
  return Math.abs(value) < 1e-10 ? 0 : Math.sign(value);
}
function intervalDirection(bounds: Interval) {
  return bounds === null ? null : bounds[0] > 0 ? 1 : bounds[1] < 0 ? -1 : 0;
}
export function assessTrend({
  slope, windowSlopes = [], intervals,
}: { slope: number | null; windowSlopes?: (number | null)[]; intervals?: [Interval, Interval] }): Verdict {
  if (slope === null) return { label: "Insufficient data", reason: "This window has too few complete years for a fitted trend." };
  const available = windowSlopes.filter((value): value is number => value !== null);
  const directions = new Set(available.map(direction));
  directions.add(direction(slope));
  const windowSensitive = directions.size > 1;
  const tested = intervals?.map(intervalDirection) ?? [];
  const estimates = tested.filter(value => value !== null);
  const methodSensitive = new Set(estimates).size > 1;
  if (windowSensitive || methodSensitive) {
    const reasons = [
      windowSensitive && "The fitted direction changes across supported time windows.",
      methodSensitive && "The nominal intervals reach different conclusions about zero in this window.",
      estimates.length === 0 && "Statistical strength was not assessed.",
    ];
    return { label: "Sensitive to analysis choices", reason: reasons.filter(Boolean).join(" ") };
  }
  if (estimates.length < 2) return { label: "Statistical strength not assessed", reason: "The fitted slope describes change over this window. This assessment has no comparison of two available uncertainty intervals." };
  if (estimates.every(value => value === direction(slope) && value !== 0)) {
    return { label: "Both nominal intervals support the fitted direction", reason: "Both selected methods exclude zero in the direction of the fitted slope. Their stated assumptions and calibration limits govern this interpretation." };
  }
  return { label: "Evidence is inconclusive", reason: "Both selected intervals include zero. The fitted slope remains a descriptive estimate for this window." };
}
