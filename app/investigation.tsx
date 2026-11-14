"use client";

import { useState } from "react";
import type region from "../data/results/sindh-t2m.v1.json";
import { TemperatureChart } from "./temperature-chart";
import { compareIntervals, includesZero, interval, pValue, signed } from "./stress-format";
import { GiovanniEvidence } from "./giovanni-evidence";

type Region = typeof region;
type Station = Region["stations"][number];
type Method = "conventional" | "hac";

const methods = [
  { id: "conventional", label: "Conventional OLS" },
  { id: "hac", label: "Newey–West HAC" },
] as const;
const gridColor = { cooling: "#9cb9ff", small: "#a6b1b7", warming: "#71e8cb" };
const gridBounds = { west: 66.5, east: 70.3, south: 24, north: 28 };
const plot = { left: 11, top: 9, width: 77, height: 78 };

function rateColor(rate: number) {
  if (rate < -0.025) return gridColor.cooling;
  if (rate > 0.025) return gridColor.warming;
  return gridColor.small;
}

function SitePlot({ stations, selected, select }: { stations: Station[]; selected: string; select: (station: string) => void }) {
  return (
    <div className="plot" role="group" aria-label="Geographic position of the eight Sindh sampling points">
      <div className="plot-grid" aria-hidden="true">
        {[24, 25, 26, 27, 28].map(lat => (
          <span key={lat} className="latitude" style={{ top: `${(28 - lat) * 25}%` }}><b>{lat}° N</b></span>
        ))}
        {[67, 68, 69, 70].map(lon => (
          <span key={lon} className="longitude" style={{ left: `${(lon - 66.5) / 3.8 * 100}%` }}><b>{lon}° E</b></span>
        ))}
      </div>
      {stations.map(site => {
        const rate = site.windows[0].trend.slope_c_per_decade;
        const top = plot.top + (gridBounds.north - site.latitude) / (gridBounds.north - gridBounds.south) * plot.height;
        const left = plot.left + (site.longitude - gridBounds.west) / (gridBounds.east - gridBounds.west) * plot.width;
        const labelLeft = site.id === "thatta" || site.id === "mithi" || site.id === "larkana";
        const labelLow = site.id === "thatta" || site.id === "badin" || site.id === "larkana";
        return (
          <button type="button" key={site.id} className="site-point" aria-pressed={site.id === selected}
            aria-label={`${site.location.city}, ${signed(rate)} degrees Celsius per decade`}
            style={{ left: `${left}%`, top: `${top}%`, color: rateColor(rate) }}
            onClick={() => select(site.id)}>
            <i aria-hidden="true" />
            <span className={`point-label ${labelLeft ? "label-left" : ""} ${labelLow ? "label-low" : ""}`}>{site.location.city}</span>
          </button>
        );
      })}
    </div>
  );
}

const period = (start: number, end: number) => `${start}–${end}`;

export function Investigation({ data }: { data: Region }) {
  const [siteId, setSiteId] = useState("karachi");
  const [windowId, setWindowId] = useState("1981-2025");
  const [method, setMethod] = useState<Method>("hac");
  const [comparisonId, setComparisonId] = useState("");
  const site = data.stations.find(item => item.id === siteId) ?? data.stations[0];
  const active = site.windows.find(item => item.id === windowId) ?? site.windows[0];
  const peer = data.stations.find(item => item.id === comparisonId && item.id !== site.id);
  const peerWindow = peer?.windows.find(item => item.id === active.id);
  const comparable = peerWindow && peerWindow.valid_years.join() === active.valid_years.join();
  const trend = active.trend;
  const rate = trend.slope_c_per_decade;
  const estimate = trend[method];
  const rates = site.windows.map(item => item.trend.slope_c_per_decade);
  const signs = new Set(rates.map(Math.sign));
  const zeroIncluded = includesZero(estimate.confidence_interval);
  const points = site.annual_series.map(point => ({
    ...point,
    fitted_c: point.year < active.start || point.year > active.end ? null
      : trend.intercept_c + rate * (point.year - trend.reference_year) / 10,
    comparison_c: peer?.annual_series.find(item => item.year === point.year)?.temperature_c ?? null,
  }));
  const cell = site.native_cell;
  const matched = data.stations.filter(item => item.native_cell !== null).length;
  const returned = site.provenance.returned_coordinates;

  function selectSite(id: string) {
    setSiteId(id);
    if (id === comparisonId) setComparisonId("");
  }

  function exportResult() {
    const exported = {
      schema_version: data.schema_version, region: data.region,
      dataset: data.dataset, methods: data.methods, limitations: data.limitations,
      site, active_window: active, selected_uncertainty_method: method,
      comparison: comparable ? { site: peer, window: peerWindow } : null,
      grid_verification: data.grid_verification,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2) + "\n"], { type: "application/json" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = `${site.id}-t2m-${active.id}.json`;
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <section id="region" className="regional-section" aria-labelledby="regional-heading">
        <div className="section-heading"><h2 id="regional-heading">Sampling locations</h2><p>Select a point to investigate its temperature record.</p></div>
        <div className="regional-grid">
          <figure className="panel geo-panel">
            <figcaption><strong>Sampling points in Sindh</strong><span>1981–2025 linear slope</span></figcaption>
            <SitePlot stations={data.stations} selected={site.id} select={selectSite} />
            <div className="geo-legend" aria-label="Slope legend in degrees Celsius per decade">
              <span><i style={{ background: gridColor.cooling }} />&lt; −0.025</span>
              <span><i style={{ background: gridColor.small }} />−0.025 to +0.025</span>
              <span><i style={{ background: gridColor.warming }} />&gt; +0.025</span>
              <span>°C/decade</span>
            </div>
          </figure>

          <aside className="panel location-card">
            <p className="eyebrow">Selected location</p>
            <h3>{site.location.city}</h3>
            <p className="location-coordinate">{site.latitude.toFixed(3)}° N · {site.longitude.toFixed(3)}° E</p>
            <dl className="selected-meta">
              <div><dt>Full record</dt><dd>{site.completeness.complete_calendar_years} complete years</dd></div>
              <div><dt>Full-record slope</dt><dd>{signed(site.windows[0].trend.slope_c_per_decade)} °C/decade</dd></div>
              <div><dt>Source</dt><dd>NASA POWER</dd></div>
            </dl>
            {site.shared_sample_flags.length > 0 && <p className="location-note">This site has a possible shared sample. See the source record.</p>}
            <label className="select-label">Compare with
              <select value={comparisonId} onChange={event => setComparisonId(event.target.value)}>
                <option value="">Choose a second location</option>
                {data.stations.filter(item => item.id !== site.id).map(item => (
                  <option key={item.id} value={item.id}>{item.location.city}</option>
                ))}
              </select>
            </label>
          </aside>
        </div>
      </section>

      <section id="stress-test" className="stress-section" aria-labelledby="stress-heading">
        <div className="section-heading"><h2 id="stress-heading">Evidence Stress Test</h2><p>Change the period or the uncertainty method for {site.location.city}.</p></div>
        <div className="panel controls">
          <fieldset><legend>Time window</legend><div className="button-group">
            {site.windows.map(item => <button type="button" key={item.id} onClick={() => setWindowId(item.id)}
              aria-pressed={active.id === item.id}>{period(item.start, item.end)}</button>)}
          </div></fieldset>
          <fieldset><legend>Uncertainty method</legend><div className="button-group">
            {methods.map(item => <button type="button" key={item.id} onClick={() => setMethod(item.id)}
              aria-pressed={method === item.id}>{item.label}</button>)}
          </div></fieldset>
        </div>
        <div className="analysis-grid">
          <figure className="panel chart-panel">
            <figcaption className="panel-title">
              <div><p className="eyebrow muted">{site.location.city} · NASA POWER</p><h3>Annual mean air temperature</h3></div>
              <span className="unit-label">°C</span>
            </figcaption>
            <TemperatureChart points={points} window={active} comparisonName={peer?.location.city} />
            <div className="legend">
              <span><i className="legend-line" />{site.location.city}</span>
              <span><i className="legend-line legend-fit" />Selected OLS fit</span>
              {peer && <span><i className="legend-line legend-peer" />{peer.location.city}</span>}
            </div>
          </figure>
          <aside className="panel interpretation" aria-live="polite">
            <p className="eyebrow">Fitted slope · {period(active.start, active.end)}</p>
            <p className="slope" data-testid="slope">{signed(rate)}</p>
            <p className="slope-unit">°C per decade</p>
            <dl className="selected-meta active-meta">
              <div><dt>Complete years</dt><dd>{active.valid_years.length}</dd></div>
              <div><dt>95% interval</dt><dd data-testid="active-ci">{interval(estimate.confidence_interval)}</dd></div>
              <div><dt>Two-sided p-value</dt><dd data-testid="active-p">{pValue(estimate.p_value)}</dd></div>
            </dl>
            <p className="active-conclusion">{zeroIncluded === null ? "Interval unavailable." : zeroIncluded ? "The selected interval includes zero." : "The selected interval excludes zero."}</p>
          </aside>
        </div>

        <section className="panel stress-evidence" aria-labelledby="estimate-heading">
          <h3 id="estimate-heading">Compare the uncertainty estimates</h3>
          <p>The methods use the same fitted line. Newey–West allows residuals in nearby years to be related, which can make its interval narrower or wider than the conventional interval.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Method</th><th scope="col">95% interval (°C/decade)</th><th scope="col">p-value</th></tr></thead>
              <tbody>{methods.map(item => (
                <tr key={item.id} className={method === item.id ? "active-estimate" : undefined}>
                  <th scope="row">{item.label}<small>{item.id === "hac" ? `Short-range dependence · ${trend.hac.max_lag_years} annual lags` : "Independent, constant-variance errors"}</small></th>
                  <td className="monospace">{interval(trend[item.id].confidence_interval)}</td>
                  <td className="monospace">{pValue(trend[item.id].p_value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="evidence-summary"><strong>{rate > 0 ? "The fitted series warms" : rate < 0 ? "The fitted series cools" : "The fitted slope is zero"} over {period(active.start, active.end)}.</strong>{" "}
            {compareIntervals(trend.conventional, trend.hac)} Across the available windows, slopes range from {signed(Math.min(...rates))} to {signed(Math.max(...rates))} °C/decade{signs.size > 1 ? " and change sign." : "."} Shorter windows typically have less power. These checks cannot attribute the change to a cause.</p>
          {peer && (
            <div className="peer-summary">
              <h4>{site.location.city} and {peer.location.city}</h4>
              {comparable && peerWindow ? (
                <p>{peer.location.city} has a fitted slope of <strong>{signed(peerWindow.trend.slope_c_per_decade)} °C/decade</strong> on the same {active.valid_years.length} complete years. {methods.find(item => item.id === method)?.label} 95% interval {interval(peerWindow.trend[method].confidence_interval)} °C/decade. This display compares the fitted slopes descriptively.</p>
              ) : <p>The sites’ fits use different or insufficient complete years for this window. The chart shows their annual means for context.</p>}
            </div>
          )}
        </section>
      </section>

      <section id="how-we-know" className="regional-section" aria-labelledby="source-heading">
        <div className="section-heading"><h2 id="source-heading">How We Know</h2><button type="button" className="download-result" onClick={exportResult}>Download selected results ↓</button></div>
        <div className="provenance-grid">
          <div className="panel source-detail">
            <h3>NASA POWER · {site.location.city}</h3>
            <p>{data.dataset.name} ({data.dataset.variable}), {data.dataset.data_type.toLowerCase()} from {data.dataset.original_product}.</p>
            <dl className="selected-meta">
              <div><dt>Resolution</dt><dd>{data.dataset.spatial_resolution} · monthly</dd></div>
              <div><dt>NASA coverage</dt><dd>{site.provenance.header.start} – {site.provenance.header.end}</dd></div>
              <div><dt>Returned point</dt><dd>{returned[1]}° N · {returned[0]}° E</dd></div>
              <div><dt>Native cell</dt><dd>{cell ? `${cell.latitude}° N · ${cell.longitude}° E` : "No unique 2023 match"}</dd></div>
              <div><dt>Valid months</dt><dd>{site.completeness.valid_months} / {site.completeness.requested_months}</dd></div>
              <div><dt>Retrieved (UTC)</dt><dd>{site.provenance.retrieved_at_utc.slice(0, 10)}</dd></div>
            </dl>
            <p>{matched} of {data.stations.length} sites matched a unique 2023 native cell by monthly values. {data.duplicate_pairs.length} pairs flagged by the duplicate screen.</p>
            <div className="source-links">
              <a href={site.provenance.source_url}>Original NASA response ↗</a>
              <a href={site.provenance.documentation_url}>POWER methods ↗</a>
              <a href={data.grid_verification.source_url}>Native-grid check ↗</a>
              {site.coordinate_source.startsWith("https://") && <a href={site.coordinate_source}>PMD reference coordinates ↗</a>}
            </div>
            <details className="annual-details"><summary>Annual temperature values</summary>
              <ol className="data-list">{site.annual_series.map(({ year, temperature_c }) => (
                <li key={year}><span>{year}</span><span>{temperature_c === null ? "Unavailable" : temperature_c.toFixed(2) + " °C"}</span></li>
              ))}</ol>
            </details>
          </div>
          <div className="panel source-detail">
            <h3>Methods and limitations</h3>
            <ul>
              <li>{data.methods.annual_aggregation}</li><li>{data.methods.regression}</li>
              <li>{data.methods.conventional} {data.methods.hac}</li>
              {data.limitations.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
        <GiovanniEvidence />
      </section>
    </>
  );
}
