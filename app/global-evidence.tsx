"use client";

import { useEffect, useState } from "react";
import { TemperatureChart } from "./temperature-chart";
import { compareAnomalies, compareWindows } from "./scan-comparison";
import { signed } from "./stress-format";

export type ScanRecord = [slope: number | null, intercept: number | null, annual: (number | null)[]];
export type ComparisonPlace = { title: string; center: string; record: ScanRecord | null };

export function GlobalEvidence({ first, second, sameCell, waiting, error, ready, chooseFirst, clear, examples }: {
  first: ComparisonPlace | null;
  second: ComparisonPlace;
  sameCell: boolean;
  waiting: boolean;
  error: boolean;
  ready: boolean;
  chooseFirst: () => void;
  clear: () => void;
  examples: (pair: "karachi" | "americas") => void;
}) {
  useEffect(() => {
    if (window.location.hash === "#global-evidence") {
      document.getElementById("global-evidence")?.scrollIntoView();
    }
  }, []);
  const [windowIndex, setWindowIndex] = useState(0);
  const [start, end] = compareWindows[windowIndex];
  const result = first?.record && second.record && !sameCell
    ? compareAnomalies(first.record[2], second.record[2], 1981, start, end) : null;
  const pairedYears = new Set(result?.pairs.map(pair => pair.year));
  const points = Array.from({ length: end - start + 1 }, (_, i) => {
    const year = start + i;
    const index = year - 1981;
    return {
      year, fitted_c: null,
      temperature_c: pairedYears.has(year) ? first?.record?.[2][index] ?? null : null,
      comparison_c: pairedYears.has(year) ? second.record?.[2][index] ?? null : null,
    };
  });

  return <section id="global-evidence" className="panel global-evidence" aria-labelledby="global-evidence-title">
    <div className="global-evidence-head">
      <div><p className="eyebrow">NASA GISTEMP</p><h3 id="global-evidence-title">Global Evidence Lab</h3>
      <p>Compare any two grid cells. Both trends use the same complete years. Annual anomalies use NASA’s 1951–1980 baseline.</p></div>
      <a className="secondary-action" href="#stress-test">Open local POWER lab ↓</a>
    </div>
    <div className="global-evidence-actions">
      <button className="secondary-action" type="button" disabled={!ready} onClick={() => examples("karachi")}>Karachi vs. Istanbul</button>
      <button className="secondary-action" type="button" onClick={() => examples("americas")}>New York vs. São Paulo</button>
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
          {result?.slopes && <div className="global-rate"><strong>{signed(result.slopes[index])}</strong><small>°C/decade</small></div>}
        </div>)}
      </div>
      <fieldset className="global-window"><legend>Comparison period</legend>
        {compareWindows.map(([a, b], index) => <button type="button" key={a + "-" + b} aria-pressed={index === windowIndex}
          onClick={() => setWindowIndex(index)}>{a}–{b}</button>)}
      </fieldset>
      {error && <p role="status" className="global-note">A cell history failed to load. Try selecting the cell again or retrying NASA data above.</p>}
      {waiting && <p role="status" className="global-note">Loading comparison cell…</p>}
      {result && <p className="global-note" role="status">{result.pairs.length} shared complete years · {result.slopes
        ? "Descriptive OLS trends. A slope difference is not a significance test."
        : `At least ${result.minimum} shared complete years are required for trends in this period.`}</p>}
      {result && result.pairs.length > 0 && <TemperatureChart points={points} primaryName={first.title} comparisonName={second.title} anomaly />}
      {result && result.pairs.length === 0 && <p className="global-note">The two cells have no complete years in common for this period.</p>}
    </>}
  </section>;
}
