import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessTrend, descriptiveFit } from "../app/verdict.ts";

test("calendar-based fit uses actual gaps and returns years and missing-data threshold", () => {
  const fit = descriptiveFit([2, null, 3, 3.5, 4], 2021, 2021, 2025, 4);
  assert.deepEqual(fit.years, [2021, 2023, 2024, 2025]);
  assert.ok(Math.abs(fit.slope - 5) < 1e-12);
  assert.ok(Math.abs(fit.intercept - 2) < 1e-12);
  assert.equal(descriptiveFit([2, null], 2021, 2021, 2022, 2).slope, null);
});

test("GISTEMP trend estimates reproduce archival data and shorter window reference", async () => {
  const row = JSON.parse(await readFile(new URL("../public/world-scan/v1/row-24.json", import.meta.url), "utf8"));
  const [archiveSlope, , series] = row[104]; // 41° N, 29° E
  assert.ok(Math.abs(descriptiveFit(series, 1981, 1981, 2025, 40).slope - archiveSlope) < 1e-5);
  const values = series.slice(20);
  // Pairwise covariance identity gives an independent slope on a contiguous record.
  let cross = 0, spread = 0;
  for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++) {
    cross += (j-i)*(values[j]-values[i]);
    spread += (j-i)**2;
  }
  assert.ok(Math.abs(descriptiveFit(series, 1981, 2001, 2025, 20).slope - 10*cross/spread) < 1e-12);
});

test("verdicts distinguish missing data, sensitivity, no inference, inconclusive, and conditional agreement", () => {
  assert.equal(assessTrend({slope:null}).label, "Insufficient data");
  assert.equal(assessTrend({slope:.1}).label, "Statistical strength not assessed");
  assert.equal(assessTrend({slope:.1, windowSlopes:[.1, -.05, null]}).label, "Sensitive to analysis choices");
  assert.equal(assessTrend({slope:.1, intervals:[[-.05,.25],[.02,.20]]}).label, "Sensitive to analysis choices");
  assert.equal(assessTrend({slope:.1, intervals:[[-.05,.25],[-.02,.20]]}).label, "Evidence is inconclusive");
  assert.equal(assessTrend({slope:.1, intervals:[[.05,.25],[.02,.20]]}).label, "Both nominal intervals support the fitted direction");
  assert.equal(assessTrend({slope:.1, intervals:[null,[.02,.20]]}).label, "Statistical strength not assessed");
});
