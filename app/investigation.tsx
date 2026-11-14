"use client";

import { useEffect, useRef, useState } from "react";
import type region from "../data/results/sindh-t2m.v1.json";
import { TemperatureChart } from "./temperature-chart";
import { compareIntervals, includesZero, interval, pValue, signed } from "./stress-format";
import { GiovanniEvidence } from "./giovanni-evidence";
import { WorldMap } from "./world-map";
import { assessTrend } from "./verdict";
import { VerdictReport, downloadEvidence } from "./verdict-report";
import { CalibrationAudit, karachiAuditCase } from "./calibration-audit";
import { CaseWorkspace } from "./case-workspace";
import { destinationHref, evidenceViews, methodViews, useWorkspace } from "./workspace-state";
import scan from "../public/world-scan/v1/manifest.json";
import dynamic from "next/dynamic";

const WorldScan = dynamic(() => import("./world-scan").then(module => module.WorldScan));
import { AnomalyCalendar, IntervalPlot } from "./evidence-visuals";

type RegionalStation = (typeof region)["stations"][number];
export type Calendar = { baseline_years: number[]; baseline_c: (number | null)[]; first_year: number; temperature_c: (number | null)[]; anomaly_c: (number | null)[] };
type Station = Omit<RegionalStation, "coordinate_source" | "location" | "shared_sample_flags" | "native_cell"> & { native_cell: {latitude: number; longitude: number} | null; coordinate_source?: string; location: { city: string }; country?: string; continent?: string; calendar?: Calendar; shared_sample_flags: {sites: string[]; reasons: string[]}[] };
type Region = Omit<typeof region, "stations" | "duplicate_pairs"> & { stations: Station[]; duplicate_pairs: {sites: string[]; reasons: string[]}[] };
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

export function Investigation({ data, worldwide = false }: { data: Region; worldwide?: boolean }) {
  const workspace = useWorkspace();
  const route = workspace?.route;
  const updateSummary = workspace?.updateSummary;
  const [legacyMode, setMode] = useState<"scan" | "local">("scan");
  const mode = route ? route.dataset === "power" ? "local" : "scan" : legacyMode;
  const scanActive = !!route && route.dataset === "gistemp" && ["explore", "evidence"].includes(route.page);
  const [caseSteps, setCaseSteps] = useState<Record<string, number>>({});
  const [visitedScan, setVisitedScan] = useState(false);
  useEffect(() => { if (scanActive) setVisitedScan(true); }, [scanActive]);
  const localMap = !route || (route.page === "explore" && route.dataset === "power");
  const localLab = !route || (route.page === "evidence" && route.dataset === "power");
  const localView = route?.view ?? "";
  const isMethods = !route || route.page === "methods";
  const sourceView = !route || route.view === "sources";
  const exportCurrent = useRef<() => void>(() => {});
  useEffect(() => {
    if (!worldwide || route) return;
    function openGlobalLab() {
      if (["#global-evidence", "#global-stress"].includes(window.location.hash)) setMode("scan");
    }
    window.addEventListener("hashchange", openGlobalLab);
    return () => window.removeEventListener("hashchange", openGlobalLab);
  }, [worldwide, route]);
  const [siteId, setSiteId] = useState("karachi");
  const [windowId, setWindowId] = useState("1981-2025");
  const [method, setMethod] = useState<Method>("hac");
  const [comparisonId, setComparisonId] = useState("");
  const [windowCheck, setWindowCheck] = useState(true);
  const [intervalCheck, setIntervalCheck] = useState(true);
  const site = data.stations.find(item => item.id === siteId) ?? data.stations[0];
  const active = site.windows.find(item => item.id === windowId) ?? site.windows[0];
  const peer = data.stations.find(item => item.id === comparisonId && item.id !== site.id);
  const peerWindow = peer?.windows.find(item => item.id === active.id);
  const comparable = peerWindow && peerWindow.valid_years.join() === active.valid_years.join();
  const trend = active.trend;
  const rate = trend.slope_c_per_decade;
  const estimate = trend[method];
  const verdict = assessTrend({ slope: rate, windowSlopes: windowCheck ? site.windows.map(window => window.trend.slope_c_per_decade) : [],
    intervals: intervalCheck ? [trend.conventional.confidence_interval, trend.hac.confidence_interval] : undefined });
  const nominalNotice = "Nominal intervals can under-cover in short or autocorrelated records. The stated model assumptions and the synthetic coverage audit qualify these comparisons.";
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
  const candidate = site.candidate_native_cells[0];
  const coordinate = (lat: number, lon: number) => `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"} · ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? "W" : "E"}`;
  const featured = [
    { id: "oslo", peer: "karachi", title: "How do Oslo and Karachi compare?", window: "1981-2025" },
    { id: "nairobi", peer: "sao-paulo", title: "How do two tropical grid cells compare?", window: "1981-2025" },
    { id: "karachi", peer: "", title: "Does the uncertainty method change the reading?", window: "2001-2025" },
  ];

  function selectSite(id: string) {
    setSiteId(id);
    if (id === comparisonId) setComparisonId("");
  }

  function loadKarachiCase(id: "1981-2025" | "2001-2025") {
    setMode("local");
    setSiteId("karachi");
    setWindowId(id);
    setComparisonId("");
    setMethod("hac");
    setWindowCheck(true);
    setIntervalCheck(true);
  }

  function exportVerdict() {
    downloadEvidence("power-verdict-" + site.id + "-" + active.id + ".json", {
      schema_version: 1, dataset: data.dataset, source: site.provenance,
      location: { name: site.location.city, requested_coordinates: { latitude: site.latitude, longitude: site.longitude },
        native_cell: site.native_cell, candidate_native_cells: site.candidate_native_cells },
      measurement_units: "°C", slope_units: "°C per decade", source_period: data.requested_years,
      analysis_period: { start: active.start, end: active.end, valid_years: active.valid_years },
      estimated_slope: rate, method: data.methods, verdict,
      checks: { windows: windowCheck, nominal_intervals: intervalCheck },
      uncertainty: intervalCheck ? {
        level: "nominal 95%", selected_display_method: method, conventional: trend.conventional, hac: trend.hac,
        calibration_audit: "/evidence-verification.v1.json", limitation: nominalNotice,
      } : null,
      sensitivity: windowCheck ? site.windows.map(window => ({
        start: window.start, end: window.end, valid_years: window.valid_years,
        slope_c_per_decade: window.trend.slope_c_per_decade,
      })) : null,
      limitations: [nominalNotice, ...data.limitations], annual_temperatures: site.annual_series,
    });
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

  useEffect(() => { exportCurrent.current = exportVerdict; });
  useEffect(() => {
    if (updateSummary) updateSummary("power", { location: site.location.city, period: period(active.start, active.end),
      exportAction: () => exportCurrent.current() });
  }, [updateSummary, site.location.city, active.start, active.end]);

  return (
    <>
      {route && (route.page === "explore" || route.page === "evidence") && <div className="workspace-controls">
        <nav className="workspace-segments" aria-label="Dataset">
          <a href={destinationHref(route.page,"gistemp",route.view)} aria-current={route.dataset==="gistemp" ? "page" : undefined}>Global · GISTEMP</a>
          <a href={destinationHref(route.page,"power",route.view)} aria-current={route.dataset==="power" ? "page" : undefined}>Local · POWER</a>
        </nav>
        <p>{route.dataset==="gistemp" ? "Surface temperature anomalies on NASA’s 2° grid." : "Near-surface air temperature at 31 sampled reanalysis locations. Explore and Evidence remember each dataset’s selection separately."}</p>
      </div>}
      {route?.page === "evidence" && <nav className="workspace-tabs" aria-label="Evidence views">{evidenceViews.map(([view,label]) =>
        <a href={destinationHref("evidence",route.dataset,view)} key={view} aria-current={route.view===view ? "page" : undefined}>
          {view==="comparison" && route.dataset==="power" ? "Anomalies" : view==="uncertainty" && route.dataset==="gistemp" ? "Evidence limits" : label}</a>)}</nav>}
      {route && (visitedScan || scanActive) && <div className="workspace-scan-view" hidden={!scanActive}><WorldScan/></div>}
      <section hidden={!localMap} id="region" className="regional-section" aria-label="Map and location inspector">
        {!route && <div className="section-heading"><h2 id="regional-heading">{worldwide ? "Explore Earth" : "Sampling locations"}</h2><p>{worldwide && mode === "scan" ? "Select a NASA GISTEMP grid cell to inspect its anomaly record." : "Select a point to investigate its NASA POWER temperature record."}</p></div>}
        {worldwide && !route && <div className="scan-mode" role="group" aria-label="NASA dataset">
          <button type="button" aria-pressed={mode === "scan"} onClick={() => setMode("scan")}>World Scan · GISTEMP</button>
          <button type="button" aria-pressed={mode === "local"} onClick={() => setMode("local")}>Local Investigations · POWER</button>
        </div>}
        {!route && worldwide && mode === "scan" ? <WorldScan /> : <div className="regional-grid">
          {worldwide ? <WorldMap stations={data.stations} selected={site.id} select={selectSite} /> : <figure className="panel geo-panel">
            <figcaption><strong>Sampling points in Sindh</strong><span>1981–2025 linear slope</span></figcaption>
            <SitePlot stations={data.stations} selected={site.id} select={selectSite} />
            <div className="geo-legend" aria-label="Slope legend in degrees Celsius per decade">
              <span><i style={{ background: gridColor.cooling }} />&lt; −0.025</span>
              <span><i style={{ background: gridColor.small }} />−0.025 to +0.025</span>
              <span><i style={{ background: gridColor.warming }} />&gt; +0.025</span>
              <span>°C/decade</span>
            </div>
          </figure>}

          <aside className="panel location-card">
            <p className="eyebrow">Selected location</p>
            <h3>{site.location.city}</h3>
            {site.country && <p className="atlas-country">{site.country} · {site.continent}</p>}
            <p className="location-coordinate">{coordinate(site.latitude, site.longitude)}</p>
            {route && <div className="scan-result"><strong>{signed(rate)}</strong><span>°C per decade</span><p>{period(active.start, active.end)} · estimated temperature trend</p></div>}
            <dl className="selected-meta">
              <div><dt>Full record</dt><dd>{site.completeness.complete_calendar_years} complete years</dd></div>
              {worldwide && <div><dt>Native grid</dt><dd>{cell ? coordinate(cell.latitude, cell.longitude) : candidate ? coordinate(candidate[0], candidate[1]) + " (inferred)" : "Unavailable"}</dd></div>}
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
            {worldwide && <a className="workspace-primary atlas-lab-link" href="#stress-test">Investigate evidence ↗</a>}
          </aside>
        </div>}
      </section>

      {localLab && <section id="stress-test" className="stress-section" aria-label="Local Evidence Lab">
        {!route && <div className="section-heading"><h2 id="stress-heading">{worldwide ? "Local Evidence Lab · POWER" : "Evidence Stress Test"}</h2><p>Change the period or the uncertainty method for {site.location.city}.{worldwide && " This lab uses 31 precomputed NASA POWER locations."}</p></div>}
        {!route && worldwide && <p className="global-lab-jump"><a className="secondary-action" href="#global-evidence" onClick={() => setMode("scan")}>Compare any two cells in the Global Evidence Lab ↗</a></p>}
        {!route && <div className="panel verdict-setup">
          <div><p className="eyebrow">NASA POWER · MERRA-2</p><h3>Investigate a trend</h3>
          <p>Choose a location and period, then select the checks to include in your verdict.</p></div>
          <label>Location<select value={site.id} onChange={event => selectSite(event.target.value)}>
            {data.stations.map(item => <option key={item.id} value={item.id}>{item.location.city}</option>)}
          </select></label>
        </div>
        }
        {route && <div className="workspace-lab-context panel">
          <div><p className="eyebrow">NASA POWER · Near-surface air temperature</p><h2>{site.location.city}</h2><p>{coordinate(site.latitude, site.longitude)} · MERRA-2 reanalysis</p></div>
          <label>Location<select value={site.id} onChange={event => selectSite(event.target.value)}>{data.stations.map(item =>
            <option key={item.id} value={item.id}>{item.location.city}</option>)}</select></label>
          <label>Analysis period<select value={active.id} onChange={event => setWindowId(event.target.value)}>{site.windows.map(item =>
            <option key={item.id} value={item.id}>{period(item.start,item.end)}</option>)}</select></label>
        </div>}
        {(!route || ["uncertainty","sensitivity","verdict"].includes(localView)) && <div className="panel controls">
          {!route && <fieldset><legend>Time window</legend><div className="button-group">
            {site.windows.map(item => <button type="button" key={item.id} onClick={() => setWindowId(item.id)}
              aria-pressed={active.id === item.id}>{period(item.start, item.end)}</button>)}
          </div></fieldset>}
          <fieldset><legend>Uncertainty method</legend><div className="button-group">
            {methods.map(item => <button type="button" key={item.id} onClick={() => setMethod(item.id)}
              aria-pressed={method === item.id}>{item.label}</button>)}
          </div></fieldset>
        </div>}
        {(!route || localView === "verdict") && <><div className="verdict-options local-verdict-options" role="group" aria-label="Evidence checks">
          <label><input type="checkbox" checked={intervalCheck} onChange={event => setIntervalCheck(event.target.checked)} /> Compare nominal intervals</label>
          <label><input type="checkbox" checked={windowCheck} onChange={event => setWindowCheck(event.target.checked)} /> Check window sensitivity</label>
        </div>
        <VerdictReport id="local-verdict" title={site.location.city} {...verdict}
          calculations="#local-calculations" calculationLabel="Inspect the regression and interval calculations"
          download={exportVerdict} items={[
            { heading: "Data", detail: <>NASA POWER {site.provenance.header.api.version} T2M near-surface air temperature (°C), derived from MERRA-2. <a href={site.provenance.source_url}>Original NASA response ↗</a></> },
            { heading: "Estimate", detail: <>{signed(rate)} °C per decade · {period(active.start, active.end)} · {active.valid_years.length} complete years</> },
            { heading: "Assumptions", detail: intervalCheck ? "Conventional OLS uses independent, constant-variance errors. Newey–West allows short-range dependence and heteroskedasticity." : "Ordinary least squares with an intercept. Interval agreement was excluded from this verdict." },
            { heading: "Sensitivity", detail: <>{windowCheck ? "Fitted slopes across windows range from " + signed(Math.min(...rates)) + " to " + signed(Math.max(...rates)) + " °C/decade. " : "Window sensitivity check is off. "}
              {intervalCheck && compareIntervals(trend.conventional, trend.hac)}</> },
            { heading: "Limits", detail: <>Sampled near {coordinate(site.latitude, site.longitude)}. These grid estimates cannot attribute causes or resolve neighborhood conditions. {nominalNotice} <a href="#calibration-audit">Read the audit ↗</a></> },
          ]} /></>}
        {(!route || localView === "trend") && <div className="analysis-grid">
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
              <div><dt>Nominal 95% interval</dt><dd data-testid="active-ci">{interval(estimate.confidence_interval)}</dd></div>
              <div><dt>Two-sided p-value</dt><dd data-testid="active-p">{pValue(estimate.p_value)}</dd></div>
            </dl>
            <p className="active-conclusion">{zeroIncluded === null ? "Interval unavailable." : zeroIncluded ? "The selected interval includes zero." : "The selected interval excludes zero."}</p>
          {route && <a className="workspace-primary" href="#local-calculations">Compare uncertainty ↗</a>}
          </aside>
        </div>}

        {(!route || localView === "uncertainty" || localView === "sensitivity") && <section className="panel stress-evidence" id="local-calculations" aria-labelledby="estimate-heading">
          <h3 id="estimate-heading">{localView === "sensitivity" ? "Time-window sensitivity" : "Compare the uncertainty estimates"}</h3>
          {(!route || localView === "uncertainty") && <>
          <p>The methods use the same fitted line. Newey–West allows residuals in nearby years to be related, which can make its interval narrower or wider than the conventional interval. Both intervals and p-values are model-based. <a href="#calibration-audit">See the coverage audit ↗</a></p>
          {worldwide && <IntervalPlot rows={methods.map(item => ({ label: item.label, rate, ci: trend[item.id].confidence_interval, selected: method === item.id }))} />}
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Method</th><th scope="col">Nominal 95% interval (°C/decade)</th><th scope="col">p-value</th></tr></thead>
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
            {compareIntervals(trend.conventional, trend.hac)} Across the available windows, slopes range from {signed(Math.min(...rates))} to {signed(Math.max(...rates))} °C/decade{signs.size > 1 ? " and change sign." : "."} Shorter windows typically have less power. These checks cannot attribute the change to a cause.</p></>}
          {worldwide && (!route || localView === "sensitivity") && <div className="window-plot"><h4>Time-window sensitivity</h4><p>Each row shows the fitted slope, interval and sample size for the selected uncertainty method.</p><IntervalPlot rows={site.windows.map(item => ({label: period(item.start, item.end), rate: item.trend.slope_c_per_decade, ci: item.trend[method].confidence_interval, selected: item.id === active.id, count: item.valid_years.length, select: () => setWindowId(item.id)}))} /></div>}
          {peer && (!route || localView === "uncertainty") && (
            <div className="peer-summary">
              <h4>{site.location.city} and {peer.location.city}</h4>
              {comparable && peerWindow ? (
                <p>{peer.location.city} has a fitted slope of <strong>{signed(peerWindow.trend.slope_c_per_decade)} °C/decade</strong> on the same {active.valid_years.length} complete years. {methods.find(item => item.id === method)?.label} nominal 95% interval {interval(peerWindow.trend[method].confidence_interval)} °C/decade. The comparison is descriptive. Nearby or distant samples may share reanalysis errors. No slope-difference test is shown.</p>
              ) : <p>The sites’ fits use different or insufficient complete years for this window. The chart shows their annual means for context.</p>}
            </div>
          )}
        </section>}
      {site.calendar && (!route || localView === "comparison") && <AnomalyCalendar calendar={site.calendar} city={site.location.city} />}
      </section>}

      {route?.page === "cases" && <CaseWorkspace key={route.view} chosen={route.view} sites={data.stations} step={caseSteps[route.view] ?? 0}
        setStep={step => setCaseSteps(previous => ({ ...previous, [route.view]: step }))}
        open={(id, peerId) => { setSiteId(id); setWindowId("1981-2025"); setComparisonId(peerId); }} openKarachi={loadKarachiCase} />}
      {worldwide && !route && <section id="featured" className="regional-section">
        <div className="section-heading"><h2>Featured investigations</h2><a href="/sindh">Open the eight-location Sindh case study ↗</a></div>
        <article className="panel verdict-report guided-case" id="karachi-case">
          <p className="eyebrow">Guided case · Karachi · NASA POWER</p>
          <h3>Can nearly the same warming rate lead to a different verdict?</h3>
          <p>Compare 45 years and 25 years from the same reanalysis cell. The full-record slope is {signed(karachiAuditCase.windows[0].slope_c_per_decade)} °C per decade and both nominal intervals exclude zero. In the recent window the slope is {signed(karachiAuditCase.windows[1].slope_c_per_decade)}, but the two intervals disagree.</p>
          <div className="global-evidence-actions">
            <a className="secondary-action" href="#local-verdict" onClick={() => loadKarachiCase("1981-2025")}>1. Inspect 1981–2025</a>
            <a className="secondary-action" href="#local-verdict" onClick={() => loadKarachiCase("2001-2025")}>2. Inspect 2001–2025</a>
          </div>
          <p>Exploratory case selected from existing results. The calculation was independently repeated from the archived monthly NASA response. <a href="/evidence-verification.v1.json">Verification record ↗</a></p>
        </article>
        <div className="featured-grid">{featured.map(story => {
          const focal = data.stations.find(item => item.id === story.id);
          const other = data.stations.find(item => item.id === story.peer);
          const fit = focal?.windows.find(item => item.id === story.window)?.trend;
          const peerFit = other?.windows.find(item => item.id === story.window)?.trend;
          if (!focal || !fit || (story.peer && !peerFit)) return null;
          return <article className="panel featured-card" key={story.id}>
            <p className="eyebrow">{focal.location.city}{other ? ` · ${other.location.city}` : ""}</p>
            <h3>{story.title}</h3>
            <p>{peerFit ? `Fitted 1981–2025 slopes: ${signed(fit.slope_c_per_decade)} and ${signed(peerFit.slope_c_per_decade)} °C per decade, respectively.` : `2001–2025: ${signed(fit.slope_c_per_decade)} °C per decade. ${compareIntervals(fit.conventional, fit.hac)}`}</p>
            <a href="#stress-test" onClick={() => { setMode("local"); setSiteId(story.id); setWindowId(story.window); setComparisonId(story.peer); }}>Open investigation ↗</a>
          </article>;
        })}</div>
      </section>}
      {isMethods && <section id="how-we-know" className="regional-section" aria-labelledby="source-heading">
        <div className="section-heading"><h2 id="source-heading">{route ? "Trace the evidence" : "How We Know"}</h2>{sourceView && <button type="button" className="download-result" onClick={exportResult}>Download selected POWER results ↓</button>}</div>
        {route && <nav className="workspace-tabs" aria-label="Methods sections">{methodViews.map(([view,label]) =>
          <a key={view} href={"#methods/"+view} aria-current={route.view===view ? "page" : undefined}>{label}</a>)}</nav>}
        <div className="provenance-grid">
          {sourceView && <>
          <div className="panel source-detail">
            <h3>NASA POWER · {site.location.city}</h3>
            <p>{data.dataset.name} ({data.dataset.variable}), {data.dataset.data_type.toLowerCase()} from {data.dataset.original_product}.</p>
            <dl className="selected-meta">
              <div><dt>Resolution</dt><dd>{data.dataset.spatial_resolution} · monthly</dd></div>
              <div><dt>NASA coverage</dt><dd>{site.provenance.header.start} – {site.provenance.header.end}</dd></div>
              <div><dt>Returned point</dt><dd>{coordinate(returned[1], returned[0])}</dd></div>
              <div><dt>Native cell</dt><dd>{cell ? coordinate(cell.latitude, cell.longitude) : worldwide && candidate ? coordinate(candidate[0], candidate[1]) + " (inferred)" : "No unique 2023 match"}</dd></div>
              <div><dt>Valid months</dt><dd>{site.completeness.valid_months} / {site.completeness.requested_months}</dd></div>
              <div><dt>Retrieved (UTC)</dt><dd>{site.provenance.retrieved_at_utc.slice(0, 10)}</dd></div>
            </dl>
            <p>{matched} of {data.stations.length} sites matched a unique 2023 native cell by monthly values. {worldwide && "Other atlas locations show nearest grid centers inferred from coordinates."} {data.duplicate_pairs.length} pairs flagged by the duplicate screen.</p>
            <div className="source-links">
              <a href={site.provenance.source_url}>Original NASA response ↗</a>
              <a href={site.provenance.documentation_url}>POWER methods ↗</a>
              <a href={data.grid_verification.source_url}>Native-grid check ↗</a>
              {site.coordinate_source?.startsWith("https://") && <a href={site.coordinate_source}>PMD reference coordinates ↗</a>}
            </div>
            <details className="annual-details"><summary>Annual temperature values</summary>
              <ol className="data-list">{site.annual_series.map(({ year, temperature_c }) => (
                <li key={year}><span>{year}</span><span>{temperature_c === null ? "Unavailable" : temperature_c.toFixed(2) + " °C"}</span></li>
              ))}</ol>
            </details>
          </div>
          {route && <div className="panel source-detail">
            <h3>NASA GISTEMP v4 LOTI</h3>
            <p>Land air and sea-surface temperature anomalies relative to 1951–1980. The original 2° grid uses 1,200 km spatial smoothing.</p>
            <p>World Scan fits 1981–2025 and supports {scan.valid_cells.toLocaleString("en-US")} analyzed grid cells.</p>
            <div className="source-links"><a href={scan.source.url}>Original NASA archive ↗</a><a href="https://data.giss.nasa.gov/gistemp/data_v4.html">GISTEMP documentation ↗</a><a href="https://www.naturalearthdata.com/">Natural Earth geographic data ↗</a></div>
          </div>}</>}
          {(!route || route.view === "methods" || route.view === "limits") && <div className="panel source-detail">
            <h3>Methods and limitations</h3>
            <ul>
              <li>{data.methods.annual_aggregation}</li><li>{data.methods.regression}</li>
              <li>{data.methods.conventional} {data.methods.hac}</li>
              <li>In a seeded 100-year AR(1) simulation, the nominal 95% HAC intervals covered the true slope in 337 of 400 runs. The nominal level is a reference, and actual coverage depends on the residual process and sample length.</li>
              {data.limitations.map(item => <li key={item}>{item}</li>)}
              {route && <li>GISTEMP trends describe a smoothed 2° cell. Nearby cells share information. The app does not establish an attribution or calibrated cell-level interval.</li>}
            </ul>
          </div>}
        </div>
        {(!route || route.view === "calibration") && <CalibrationAudit />}
        {(!route || route.view === "giovanni") && <GiovanniEvidence />}
        {route?.view === "reproduce" && <article className="panel source-detail">
          <h3>Reproduce from the original records</h3><p>Scientific data, code and receipt checksums are archived in the project repository. The evidence downloads include selected periods, estimates, and their limits.</p>
          <div className="source-links"><a href="https://github.com/harisawan27/verdict-earth/blob/master/submission/SCIENTIFIC_METHODOLOGY.md">Full scientific methodology ↗</a><a href="/evidence-verification.v1.json" download>Calibration and case verification JSON ↓</a></div>
        </article>}
        {route && ["methods","limits"].includes(route.view) && <p className="workspace-legacy"><a href="https://github.com/harisawan27/verdict-earth/blob/master/submission/SCIENTIFIC_METHODOLOGY.md">Full methodology and reproducibility notes ↗</a></p>}
      </section>}
    </>
  );
}
