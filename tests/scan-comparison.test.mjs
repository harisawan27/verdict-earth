import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compareAnomalies } from "../app/scan-comparison.ts";

test("both slopes use only complete shared years and calendar spacing", () => {
  const a = Array.from({length: 25}, (_, i) => i * 0.04);
  const b = Array.from({length: 25}, (_, i) => 3 - i * 0.025);
  a[3] = null;
  b[10] = null;
  const fit = compareAnomalies(a, b, 2001, 2001, 2025);
  assert.equal(fit.pairs.length, 23);
  assert.ok(Math.abs(fit.slopes[0] - 0.4) < 1e-12);
  assert.ok(Math.abs(fit.slopes[1] + 0.25) < 1e-12);
});

test("insufficient shared data does not produce slopes", () => {
  const a = Array(25).fill(0);
  const b = [...Array(19).fill(1), ...Array(6).fill(null)];
  const fit = compareAnomalies(a, b, 2001, 2001, 2025);
  assert.equal(fit.minimum, 20);
  assert.equal(fit.pairs.length, 19);
  assert.equal(fit.slopes, null);
});

test("comparing Karachi and Istanbul reproduces the stored trends on the full record", async () => {
  const dir = new URL("../public/world-scan/v1/", import.meta.url);
  const rows = await Promise.all([32, 24].map(i => readFile(new URL("row-" + i + ".json", dir), "utf8").then(JSON.parse)));
  const karachi = rows[0][123];
  const istanbul = rows[1][104];
  const fit = compareAnomalies(karachi[2], istanbul[2], 1981, 1981, 2025);
  assert.equal(fit.pairs.length, 45);
  for (const [i, expected] of [karachi[0], istanbul[0]].entries()) {
    assert.ok(Math.abs(fit.slopes[i] - expected) < 0.00002);
  }
});
