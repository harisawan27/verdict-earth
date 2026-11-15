"use client";

import { useEffect } from "react";
import manifest from "../public/world-scan/v1/manifest.json";
import { signed } from "./stress-format";
import { assessTrend } from "./verdict";
import type { Fit } from "./verdict";
import { VerdictReport, downloadEvidence } from "./verdict-report";

const limits = [
  "GISTEMP combines land-surface air and sea-surface temperatures in a smoothed anomaly field. Grid spacing is " + manifest.resolution_degrees + "° and the smoothing scale is " + manifest.smoothing_km.toLocaleString("en-US") + " km.",
  "Nearby cells share information. These grid estimates do not resolve individual weather stations or neighborhoods.",
  "Fits describe the selected years. The app reports no cell-level confidence interval, significance test, or attribution.",
];

export function GlobalStress({ name, coordinates, point, fit, fits, active, setActive, annual, available, failed, checks, setChecks, view }: {
  name: string;
  coordinates: { latitude: number; longitude: number };
  point: [number, number];
  fit: Fit;
  fits: Fit[];
  active: number;
  setActive: (index: number) => void;
  annual: (number | null)[];
  available: boolean;
  failed: boolean;
  checks: boolean;
  setChecks: (enabled: boolean) => void;
  view?: "sensitivity" | "verdict";
}) {
  useEffect(() => {
    if (window.location.hash === "#global-stress") document.getElementById("global-stress")?.scrollIntoView();
  }, []);
  const verdict = assessTrend({ slope: fit.slope, windowSlopes: checks ? fits.map(window => window.slope) : [] });
  const complete = fit.years.length;
  const supported = fits.filter(window => window.slope !== null);
  const range = supported.map(window => window.slope!);
  const report = {
    schema_version: 1, dataset: manifest.dataset, source: manifest.source, product_note: manifest.metadata.netcdf_history,
    variable: "Land-ocean surface temperature anomaly", measurement_units: "°C",
    slope_units: "°C per decade", baseline: manifest.baseline, spatial_resolution_degrees: manifest.resolution_degrees,
    smoothing_km: manifest.smoothing_km, requested_point: { longitude: point[0], latitude: point[1] },
    grid_cell: coordinates, source_period: manifest.period, source_coverage_months: manifest.metadata.source_coverage, analysis_window: fit,
    method: manifest.trend_method, comparison_windows: checks ? fits : null,
    uncertainty: { assessed: false, reason: limits[2] }, verdict, limitations: limits,
    annual_anomalies: annual.map((anomaly_c, index) => ({year: manifest.period[0] + index, anomaly_c})),
  };

  return <section className="panel global-evidence global-stress" id="global-stress" aria-labelledby="global-stress-title">
    <p className="eyebrow">World Scan · NASA GISTEMP v4 LOTI</p>
    <h3 id="global-stress-title">{view === "verdict" ? "Assessment for this grid cell" : "Global Evidence Stress Test"}</h3>
    {view !== "verdict" && <p>Compare fitted slopes across the available windows for the selected GISTEMP grid cell.</p>}
    <div className="verdict-options">
      {!view && <fieldset className="global-window"><legend>Analysis period</legend>{fits.map((window, index) => (
        <button type="button" key={window.start + "-" + window.end} aria-pressed={index === active}
          onClick={() => setActive(index)}>{window.start}–{window.end}</button>
      ))}</fieldset>}
      <label><input type="checkbox" checked={checks} onChange={event => setChecks(event.target.checked)} /> Check window sensitivity</label>
    </div>
    {!available ? <p role="status">{failed ? "The cell record could not be loaded. Retry loading NASA data above." : "Loading the selected cell’s anomaly record…"}</p> : <>
      {view !== "sensitivity" && <VerdictReport id="global-verdict" title={name} {...verdict}
        calculations={checks ? "#global-window-results" : "#scan-series"} calculationLabel={checks ? "Inspect calculated windows" : "Inspect the annual series and fit"}
        download={() => downloadEvidence(`gistemp-verdict-${coordinates.latitude}-${coordinates.longitude}-${fit.start}-${fit.end}.json`, report)}
        items={[
          { heading: "Data", detail: <>NASA GISTEMP v4 LOTI temperature anomalies (°C), relative to {manifest.baseline.join("–")}. <a href={manifest.source.url}>Original NASA NetCDF ↗</a></> },
          { heading: "Estimate", detail: <>{fit.slope === null ? "Trend unavailable" : signed(fit.slope) + " °C per decade"} · {fit.start}–{fit.end} · {complete}/{fit.end - fit.start + 1} complete years ({fit.minimum} required)</> },
          { heading: "Assumptions", detail: "Ordinary least squares with an intercept and the actual spacing between complete calendar years. Each annual anomaly uses month-length weights." },
          { heading: "Sensitivity", detail: checks && range.length ? `${supported.length} of ${fits.length} windows supported · slopes ${signed(Math.min(...range))} to ${signed(Math.max(...range))} °C/decade` : checks ? "No window meets the completeness threshold." : "Window sensitivity check is off." },
          { heading: "Limits", detail: <>{Math.abs(coordinates.latitude)}° {coordinates.latitude < 0 ? "S" : "N"} · {Math.abs(coordinates.longitude)}° {coordinates.longitude < 0 ? "W" : "E"} grid-cell center. {limits[0]} {limits[2]}</> },
        ]} />}
      {view !== "verdict" && <div className="table-wrap" id="global-window-results"><table>
        <caption>Time-window estimates for this cell</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Complete years</th><th scope="col">Fitted slope (°C/decade)</th></tr></thead>
        <tbody>{fits.map(window => <tr key={window.start + "-" + window.end}>
          <th scope="row">{window.start}–{window.end}</th><td>{window.years.length}/{window.end - window.start + 1} · {window.minimum} required</td>
          <td>{window.slope === null ? "Insufficient data" : signed(window.slope)}</td></tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}
