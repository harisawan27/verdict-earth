import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzePower, InsufficientPowerData, powerCoordinates, powerSource } from "../app/power-analysis.ts";

const bytes = readFileSync(new URL("../data/raw/nasa-power-karachi-t2m-1981-2025.json", import.meta.url));
const raw = JSON.parse(bytes);
const archive = JSON.parse(readFileSync(new URL("../data/results/world-t2m.v1.json", import.meta.url)));
const archived = archive.stations.find(({ id }) => id === "karachi");
const receipt = { retrieved_at_utc: archived.provenance.retrieved_at_utc, sha256: createHash("sha256").update(bytes).digest("hex") };
const analyze = payload => analyzePower(payload, archived.latitude, archived.longitude, receipt);
const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " differs from " + expected);
};

test("point requests validate and round coordinates and use the fixed NASA query", () => {
  assert.deepEqual(powerCoordinates("41.01761", "28.97432"), { latitude: 41.0176, longitude: 28.9743 });
  assert.deepEqual(powerCoordinates("-90", "180"), { latitude: -90, longitude: 180 });
  for (const [lat, lon] of [[null, "0"], ["", "0"], [" ", "0"], ["90.1", "0"], ["0", "180.1"], ["0", "Infinity"]]) {
    assert.equal(powerCoordinates(lat, lon), null);
  }
  const source = new URL(powerSource(41.0176, 28.9743));
  assert.equal(source.origin + source.pathname, "https://power.larc.nasa.gov/api/temporal/monthly/point");
  assert.deepEqual(Object.fromEntries(source.searchParams), {
    parameters: "T2M", community: "SB", latitude: "41.0176", longitude: "28.9743", start: "1981", end: "2025", format: "JSON",
  });
});

test("on-demand POWER matches the archived Python results for the same NASA bytes", () => {
  const result = analyze(raw);
  assert.equal(result.provenance.sha256, archived.provenance.sha256);
  assert.equal(result.live, true);
  assert.equal(result.native_cell, null);
  assert.deepEqual(result.candidate_native_cells, archived.candidate_native_cells);
  assert.deepEqual(result.completeness, archived.completeness);
  assert.deepEqual(result.calendar, archived.calendar);
  for (const [i, year] of result.annual_series.entries()) {
    assert.equal(year.year, archived.annual_series[i].year);
    near(year.temperature_c, archived.annual_series[i].temperature_c);
  }
  for (const [i, window] of result.windows.entries()) {
    const expected = archived.windows[i];
    assert.equal(window.id, expected.id);
    assert.deepEqual(window.valid_years, expected.valid_years);
    for (const name of ["slope_c_per_decade", "intercept_c"]) near(window.trend[name], expected.trend[name]);
    for (const method of ["conventional", "hac"]) {
      const actual = window.trend[method];
      const reference = expected.trend[method];
      near(actual.standard_error, reference.standard_error);
      near(actual.p_value, reference.p_value, 1e-7);
      actual.confidence_interval.forEach((limit, j) => near(limit, reference.confidence_interval[j], 1e-7));
    }
  }
});

test("missing, fill and partial months exclude years and incomplete reference normals", () => {
  const partial = structuredClone(raw);
  partial.header.start = "19810102";
  delete partial.properties.parameter.T2M["199101"];
  partial.properties.parameter.T2M["199202"] = partial.header.fill_value;
  const result = analyze(partial);
  assert.deepEqual(result.completeness.partial_months, ["1981-01"]);
  assert.deepEqual(result.completeness.absent_months, ["1991-01"]);
  assert.deepEqual(result.completeness.fill_value_months, ["1992-02"]);
  assert.deepEqual(result.completeness.excluded_calendar_years, [1981, 1991, 1992]);
  assert.equal(result.calendar.baseline_c[0], null);
  assert.equal(result.calendar.baseline_c[1], null);
  assert.equal(result.calendar.anomaly_c[12], null);
  assert.ok(result.calendar.baseline_c[2] !== null);
  assert.equal(result.windows[0].valid_years.length, 42);
});

test("rejects mismatched NASA metadata and an unusable point record", () => {
  const wrongUnits = structuredClone(raw);
  wrongUnits.parameters.T2M.units = "K";
  assert.throws(() => analyze(wrongUnits), /temperature units/);
  assert.throws(() => analyzePower(raw, 0, 0, receipt), /metadata/);
  const sparse = structuredClone(raw);
  sparse.properties.parameter.T2M = {};
  assert.throws(() => analyze(sparse), InsufficientPowerData);
});

test("an exact fit returns unavailable uncertainty", () => {
  const constant = structuredClone(raw);
  for (const key of Object.keys(constant.properties.parameter.T2M)) constant.properties.parameter.T2M[key] = 20;
  const result = analyze(constant);
  assert.equal(result.windows[0].trend.slope_c_per_decade, 0);
  assert.equal(result.windows[0].trend.conventional.confidence_interval, null);
  assert.equal(result.windows[0].trend.hac.p_value, null);
});
