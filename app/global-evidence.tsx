"use client";

import { useEffect } from "react";
import manifest from "../public/world-scan/v1/manifest.json";
import { TemperatureChart } from "./temperature-chart";
import { compareAnomalies, compareWindows } from "./scan-comparison";
import { SlopeComparison } from "./evidence-visuals";

export type ScanRecord = [slope: number | null, intercept: number | null, annual: (number | null)[]];
export type ComparisonPlace = { title: string; center: string; record: ScanRecord | null };

export function GlobalEvidence({ first, second, sameCell, waiting, error, ready, windowIndex, setWindowIndex, chooseFirst, clear, examples, visible = true }: {
  first: ComparisonPlace | null;
  second: ComparisonPlace;
  sameCell: boolean;
  waiting: boolean;
  visible?: boolean;
  error: boolean;
  ready: boolean;
  windowIndex: number;
  setWindowIndex: (index: number) => void;
  chooseFirst: () => void;
  clear: () => void;
  examples: (pair: "karachi" | "americas") => void;
}) {
  useEffect(() => {
    if (visible && window.location.hash === "#global-evidence") {
      document.getElementById("global-evidence")?.scrollIntoView();
    }
  }, [visible]);
  const firstYear = manifest.period[0];
  const [start, end] = compareWindows[windowIndex];
  const result = first?.record && second.record && !sameCell
    ? compareAnomalies(first.record[2], second.record[2], firstYear, start, end) : null;
  const pairedYears = new Set(result?.pairs.map(pair => pair.year));
  const points = Array.from({ length: end - start + 1 }, (_, i) => {
    const year = start + i;
    const index = year - firstYear;
    return {
      year, fitted_c: null,
      temperature_c: pairedYears.has(year) ? first?.record?.[2][index] ?? null : null,
      comparison_c: pairedYears.has(year) ? second.record?.[2][index] ?? null : null,
    };
  });

  return <section hidden={!visible} id="global-evidence" className="panel global-evidence" aria-labelledby="global-evidence-title">
    <div className="global-evidence-head">
      <div><p className="eyebrow">NASA GISTEMP</p><h3 id="global-evidence-title">Global Evidence Lab</h3>
      <p>Fit two selected cells on the same complete years. Each period requires at least 80% shared complete years, rounded up. Annual anomalies use NASA’s {manifest.baseline.join("–")} baseline.</p></div>
      <a className="workspace-secondary" href="#explore/gistemp">Choose cells on the map ↗</a>
    </div>
    <div className="global-evidence-actions">
      <button className="secondary-action" type="button" disabled={!ready} onClick={() => examples("karachi")}>Karachi vs. Istanbul</button>
      <button className="secondary-action" type="button" disabled={!ready} onClick={() => examples("americas")}>New York vs. São Paulo</button>
      {first && <button className="secondary-action" type="button" onClick={clear}>Clear comparison</button>}
    </div>
    {!first ? <div className="global-empty">
      <p>Pin the selected cell as <strong>A</strong>, then pick <strong>B</strong> on the map or through search.</p>
      <button className="primary-action" type="button" onClick={chooseFirst}>Pin selected cell as A</button>
    </div> : <>
      <div className="global-pair">
        {[first, second].map((location, index) => <div key={index} className="global-location">
          <span className={"scan-letter " + (index === 1 ? "scan-letter-b" : "")}>{index === 0 ? "A" : "B"}</span>
          <div><strong>{index === 1 && sameCell ? "Choose a second cell" : location.title}</strong>
          <p>{index === 1 && sameCell ? "Search a place or tap a different cell." : location.center}</p></div>

        </div>)}
      </div>
      <fieldset className="global-window"><legend>Comparison period</legend>
        {compareWindows.map(([a, b], index) => <button type="button" key={a + "-" + b} aria-pressed={index === windowIndex}
          onClick={() => setWindowIndex(index)}>{a}–{b}</button>)}
      </fieldset>
      {error && <p role="status" className="global-note">A cell history failed to load. <a href="#explore/gistemp">Open the map</a> to select a cell again or retry loading its record.</p>}
      {waiting && <p role="status" className="global-note">Loading comparison cell…</p>}
      {result && <p className="global-note" role="status">{result.pairs.length} shared complete years · {result.slopes
        ? "The fits describe each cell. The difference between slopes has no significance test here."
        : `At least ${result.minimum} shared complete years are required for trends in this period.`}</p>}
      {visible && result && result.pairs.length > 0 && <TemperatureChart points={points} primaryName={first.title} comparisonName={second.title} anomaly />}
      {result?.slopes && <SlopeComparison rows={[{ label: first.title, rate: result.slopes[0] }, { label: second.title, rate: result.slopes[1] }]}
        context={result.pairs.length + " shared complete years · descriptive"} />}
      {result && result.pairs.length === 0 && <p className="global-note">The two cells have no complete years in common for this period.</p>}
    </>}
  </section>;
}
