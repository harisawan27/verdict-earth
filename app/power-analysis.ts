import jStat from "jstat";
import type { Station } from "./investigation";

export const firstYear = 1981;
export const lastYear = 2025;
const windows = [[1981, 2025], [1991, 2025], [2001, 2025], [1981, 2015]];
const latitudeSpacing = 0.5;
const longitudeSpacing = 0.625;
const toMonth = (year: number, month: number) => year + "-" + String(month).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const round = (value: number) => Math.round(value * 1000) / 1000;
const mean = (items: number[]) => items.reduce((sum, item) => sum + item, 0) / items.length;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function powerCoordinates(lat: string | null, lon: string | null) {
  const number = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!lat || !lon || !number.test(lat) || !number.test(lon)) return null;
  const latitude = Number(lat), longitude = Number(lon);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)) };
}

export function powerSource(latitude: number, longitude: number) {
  return "https://power.larc.nasa.gov/api/temporal/monthly/point?" + new URLSearchParams({
    parameters: "T2M", community: "SB", latitude: String(latitude), longitude: String(longitude),
    start: String(firstYear), end: String(lastYear), format: "JSON",
  });
}

function dateIsValid(date: string) {
  if (typeof date !== "string" || !/^\d{8}$/.test(date)) return false;
  const year = +date.slice(0, 4), month = +date.slice(4, 6), day = +date.slice(6);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function uncertainty(slope: number, variance: number, df: number): Station["windows"][number]["trend"]["conventional"] {
  if (!Number.isFinite(variance) || variance <= 0) {
    return { standard_error: null, confidence_interval: null, p_value: null };
  }
  const se = Math.sqrt(variance);
  const margin = jStat.studentt.inv(0.975, df) * se;
  const t = slope / se;
  // The incomplete beta expresses the two-sided Student t tail directly.
  return { standard_error: se, confidence_interval: [slope - margin, slope + margin],
    p_value: jStat.ibeta(df / (df + t * t), df / 2, 0.5) };
}

function fit(points: { year: number; temperature_c: number }[]): Station["windows"][number]["trend"] {
  const n = points.length, df = n - 2, reference = points[0].year;
  const x = points.map(p => (p.year - reference) / 10);
  const y = points.map(p => p.temperature_c);
  const xMean = mean(x), yMean = mean(y);
  const centered = x.map(value => value - xMean);
  const sxx = centered.reduce((sum, value) => sum + value * value, 0);
  const constant = y.every(value => value === y[0]);
  const slope = constant ? 0 : centered.reduce((sum, value, i) => sum + value * (y[i] - yMean), 0) / sxx;
  const intercept = constant ? y[0] : yMean - slope * xMean;
  const residuals = y.map((value, i) => value - (intercept + slope * x[i]));
  const degenerate = Math.max(...residuals.map(Math.abs)) <= 32 * Number.EPSILON * Math.max(1, ...y.map(Math.abs));
  const variance = residuals.reduce((sum, value) => sum + value * value, 0) / (df * sxx);
  const lag = Math.floor(4 * (n / 100) ** (2 / 9));
  // Slope's contribution to the HAC sandwich. A missing calendar year has zero score.
  const scores = Array<number>(points[n - 1].year - reference + 1).fill(0);
  points.forEach(({ year }, i) => { scores[year - reference] = centered[i] * residuals[i] / sxx; });
  let hac = scores.reduce((sum, value) => sum + value * value, 0);
  for (let k = 1; k <= lag; k++) {
    const product = scores.slice(k).reduce((sum, value, i) => sum + value * scores[i], 0);
    hac += 2 * (1 - k / (lag + 1)) * product;
  }
  return {
    model: "Ordinary least squares with intercept", reference_year: reference, slope_c_per_decade: slope,
    intercept_c: intercept, degrees_of_freedom: df, confidence_level: 0.95,
    conventional: uncertainty(slope, degenerate ? 0 : variance, df),
    hac: { ...uncertainty(slope, degenerate ? 0 : hac * n / df, df),
      kernel: "Bartlett", max_lag_years: lag, bandwidth_rule: "floor(4 × (n / 100)^(2/9))",
      small_sample_correction: "n / (n − 2)",
      reference_distribution: "Student t (n − 2 degrees of freedom, approximate)" },
  };
}

const nearest = (value: number, spacing: number) => {
  const index = value / spacing, lower = Math.floor(index);
  return Math.abs(index - lower - 0.5) < 1e-9
    ? [lower * spacing, (lower + 1) * spacing] : [Math.floor(index + 0.5) * spacing];
};
type Source = {
  type: string;
  geometry: { type: string; coordinates: number[] };
  header: Station["provenance"]["header"];
  parameters: { T2M: Station["provenance"]["parameter"] };
  properties: { parameter: { T2M: Record<string, number> } };
  messages: Station["provenance"]["messages"];
};

export class InsufficientPowerData extends Error {}

export function analyzePower(payload: unknown, latitude: number, longitude: number,
  receipt: Pick<Station["provenance"], "retrieved_at_utc" | "sha256">): Station {
  const response = payload as Partial<Source>;
  const header = response?.header;
  const coords = response?.geometry?.coordinates;
  const metadata = response?.parameters?.T2M;
  if (response?.type !== "Feature" || response.geometry?.type !== "Point" || !Array.isArray(coords) || coords.length < 2 ||
      !coords.every(finite) || Math.abs(coords[0] - longitude) > 0.000500001 ||
      Math.abs(coords[1] - latitude) > 0.000500001 || !header ||
      !Array.isArray(header.sources) || header.sources.join() !== "MERRA2" || header.time_standard !== "LST" ||
      typeof header.api?.name !== "string" || !header.api.name || typeof header.api?.version !== "string" || !header.api.version ||
      metadata?.units !== "C" || typeof metadata.longname !== "string" || !finite(header.fill_value) ||
      !dateIsValid(header.start) || !dateIsValid(header.end) || header.start > header.end ||
      header.start < firstYear + "0101" || header.end > lastYear + "1231") {
    throw new Error("Unexpected NASA POWER point metadata or temperature units.");
  }
  const values = response.properties?.parameter?.T2M;
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("NASA POWER monthly values are missing.");
  const fillMonths: string[] = [], absentMonths: string[] = [], partialMonths: string[] = [];
  let annualSummaries = 0, monthKeys = 0;
  const monthly = new Map<string, number | null>();
  for (const [key, value] of Object.entries(values)) {
    const year = +key.slice(0, 4), month = +key.slice(4);
    if (!/^\d{6}$/.test(key) || year < firstYear || year > lastYear || month < 1 || month > 13 || !finite(value)) {
      throw new Error("Unexpected NASA POWER monthly value.");
    }
    if (month === 13) { annualSummaries++; continue; }
    const name = toMonth(year, month), isFill = value === header.fill_value;
    const end = key + daysInMonth(year, month);
    if (end < header.start || key + "01" > header.end) throw new Error("NASA POWER observation falls outside its coverage.");
    const partial = key + "01" < header.start || end > header.end;
    if (isFill) fillMonths.push(name);
    if (partial) partialMonths.push(name);
    monthly.set(name, isFill || partial ? null : value);
    monthKeys++;
  }
  const temperature: (number | null)[] = [];
  const annual: Station["annual_series"] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    let total = 0, days = 0, count = 0;
    for (let month = 1; month <= 12; month++) {
      const name = toMonth(year, month), value = monthly.get(name);
      if (value === undefined) absentMonths.push(name);
      temperature.push(value ?? null);
      if (value == null) continue;
      const weight = daysInMonth(year, month);
      total += value * weight;
      days += weight;
      count++;
    }
    annual.push({ year, temperature_c: count === 12 ? total / days : null });
  }
  const complete = annual.filter((point): point is { year: number; temperature_c: number } => point.temperature_c !== null);
  if (complete.length < 5) throw new InsufficientPowerData("NASA POWER returned fewer than five complete calendar years for this point.");
  const fittedWindows = windows.flatMap(([start, end]) => {
    const selected = complete.filter(p => p.year >= start && p.year <= end);
    return selected.length >= 5 ? [{ id: start + "-" + end, start, end, valid_years: selected.map(p => p.year), trend: fit(selected) }] : [];
  });
  const normals = Array.from({ length: 12 }, (_, i) => {
    const values = temperature.filter((_, index) => index % 12 === i && index >= 120 && index < 480).filter(finite);
    return values.length === 30 ? mean(values) : null;
  });
  return {
    id: "power:" + latitude + "," + longitude, latitude, longitude, location: { city: latitude + "°, " + longitude + "°" },
    live: true, native_cell: null, candidate_native_cells: nearest(latitude, latitudeSpacing)
      .flatMap(lat => nearest(longitude, longitudeSpacing).map(lon => [lat, lon])),
    shared_sample_flags: [], annual_series: annual, windows: fittedWindows,
    calendar: { first_year: firstYear, baseline_years: [1991, 2020], baseline_c: normals.map(v => v === null ? null : round(v)),
      temperature_c: temperature.map(v => v === null ? null : round(v)),
      anomaly_c: temperature.map((v, i) => { const baseline = normals[i % 12]; return v === null || baseline === null ? null : round(v - baseline); }) },
    completeness: { requested_months: temperature.length, returned_month_keys: monthKeys,
      valid_months: temperature.filter(finite).length, absent_months: absentMonths, fill_value_months: fillMonths.sort(),
      partial_months: partialMonths.sort(), ignored_annual_summaries: annualSummaries, complete_calendar_years: complete.length,
      excluded_calendar_years: annual.filter(p => p.temperature_c === null).map(p => p.year) },
    provenance: { ...receipt, source_url: powerSource(latitude, longitude),
      documentation_url: "https://power.larc.nasa.gov/docs/services/api/temporal/monthly/",
      source_documentation_url: "https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/",
      attribution: "NASA Langley Research Center POWER Project, using NASA GMAO MERRA-2.",
      community: "SB", header, parameter: metadata, returned_coordinates: coords, messages: response.messages ?? [] },
  };
}
