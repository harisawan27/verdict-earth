"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import manifest from "../public/world-scan/v1/manifest.json";
import { signed } from "./stress-format";
import { TemperatureChart } from "./temperature-chart";

const base = "/world-scan/v1";
const { rows, columns, missing, map_scale: scale, period, resolution_degrees: step } = manifest;
const [firstYear, lastYear] = period;
const totalYears = lastYear - firstYear + 1;
const colors = [
  { edge: -0.4, fill: "#385e9e", label: "≤ −0.4" },
  { edge: -0.1, fill: "#70a0ce", label: "−0.4 to −0.1" },
  { edge: 0.1, fill: "#d2d2cc", label: "−0.1 to +0.1" },
  { edge: 0.4, fill: "#e9aa69", label: "+0.1 to +0.4" },
  { edge: 0.7, fill: "#dc724f", label: "+0.4 to +0.7" },
  { edge: Infinity, fill: "#a9404c", label: "> +0.7" },
];
const noData = "#20333e";
const wrap = (position: number, width: number) => ((position % width) + width) % width;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const toCell = (lat: number, lon: number) => ({
  row: clamp(Math.floor((90 - lat) / step), 0, rows - 1),
  column: Math.floor(wrap(lon + 180, 360) / step),
});
const textCoordinate = (value: number, negative: string, positive: string) =>
  Math.abs(value) + "° " + (value < 0 ? negative : positive);

type Cell = ReturnType<typeof toCell>;
type View = { x: number; y: number; zoom: number };
type Detail = [slope: number | null, intercept: number | null, annual: (number | null)[]];
type Drag = { x: number; y: number; origin: View; moved: boolean };

export const scanManifest = manifest;

export function WorldScan() {
  const [grid, setGrid] = useState<Int16Array | null>(null);
  const [coast, setCoast] = useState<HTMLImageElement | null>(null);
  const [mapError, setMapError] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [cell, setCell] = useState<Cell>(() => toCell(25, 67));
  const [input, setInput] = useState({ latitude: "25", longitude: "67" });
  const [detail, setDetail] = useState<{ row: number; values: Detail[] } | null>(null);
  const [detailError, setDetailError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const raster = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const cached = useRef(new Map<number, Detail[]>());
  const [retry, setRetry] = useState(0);
  const latitude = manifest.first_latitude - cell.row * step;
  const longitude = manifest.first_longitude + cell.column * step;
  const caption = textCoordinate(latitude, "S", "N") + " · " + textCoordinate(longitude, "W", "E");

  useEffect(() => {
    const image = new Image();
    image.onload = () => setCoast(image);
    image.src = "/world-scan/coastline.svg";
    return () => { image.onload = null; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(base + "/slopes.bin", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("World Scan raster");
      return response.arrayBuffer();
    }).then(buffer => {
      if (buffer.byteLength !== rows * columns * 2) throw new Error("Unexpected raster size");
      const bytes = new DataView(buffer);
      const values = Int16Array.from({ length: rows * columns }, (_, index) => bytes.getInt16(index * 2, true));
      const image = document.createElement("canvas");
      image.width = columns;
      image.height = rows;
      const context = image.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      values.forEach((value, index) => {
        context.fillStyle = value === missing ? noData : colors.find(color => value / scale <= color.edge)!.fill;
        context.fillRect(index % columns, Math.floor(index / columns), 1, 1);
      });
      raster.current = image;
      setGrid(values);
    }).catch(() => { if (!controller.signal.aborted) setMapError(true); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const row = cell.row;
    const stored = cached.current.get(row);
    if (stored) {
      setDetail({ row, values: stored });
      return;
    }
    const controller = new AbortController();
    fetch(base + "/row-" + row + ".json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("GISTEMP cell details");
      return response.json() as Promise<Detail[]>;
    }).then(values => {
      if (values.length !== columns) throw new Error("Unexpected detail row");
      if (cached.current.size >= 12) cached.current.delete(cached.current.keys().next().value!);
      cached.current.set(row, values);
      setDetail({ row, values });
    }).catch(() => { if (!controller.signal.aborted) setDetailError(true); });
    return () => controller.abort();
  }, [cell.row, retry]);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    const image = raster.current;
    if (!context || !image || !grid) return;
    const { width, height } = context.canvas;
    const factor = width / columns * view.zoom;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    for (const offset of [-columns, 0, columns]) {
      const left = (offset - view.x) * factor;
      const top = -view.y * factor;
      context.drawImage(image, left, top, columns * factor, rows * factor);
      if (coast) context.drawImage(coast, left, top, columns * factor, rows * factor);
    }
    context.strokeStyle = "#fff";
    context.lineWidth = 2;
    for (const offset of [0, columns]) {
      const x = (cell.column + offset + 0.5 - view.x) * factor;
      const y = (cell.row + 0.5 - view.y) * factor;
      const radius = Math.max(6, factor * 0.75);
      context.beginPath();
      context.arc(x, y, radius, 0, 2 * Math.PI);
      context.stroke();
    }
  }, [cell, coast, grid, view]);

  function select(next: Cell, center = false) {
    if (next.row !== cell.row) setDetailError(false);
    setCell(next);
    setInput({
      latitude: String(manifest.first_latitude - next.row * step),
      longitude: String(manifest.first_longitude + next.column * step),
    });
    if (center && view.zoom > 1) {
      position(next.column + 0.5 - columns / view.zoom / 2, next.row + 0.5 - rows / view.zoom / 2, view.zoom);
    }
  }

  function position(x: number, y: number, zoom: number) {
    setView({ x: wrap(x, columns), y: clamp(y, 0, rows - rows / zoom), zoom });
  }

  function changeZoom(target: number) {
    const zoom = clamp(target, 1, 8);
    position(view.x + columns / view.zoom / 2 - columns / zoom / 2,
      view.y + rows / view.zoom / 2 - rows / zoom / 2, zoom);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current;
    if (!start || view.zoom === 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 4 && !start.moved) return;
    start.moved = true;
    const rect = event.currentTarget.getBoundingClientRect();
    position(start.origin.x - dx / rect.width * columns / start.origin.zoom,
      start.origin.y - dy / rect.height * rows / start.origin.zoom, start.origin.zoom);
  }

  function pick(event: PointerEvent<HTMLCanvasElement>) {
    const moved = drag.current?.moved;
    drag.current = null;
    if (moved || !grid) return;
    const rect = event.currentTarget.getBoundingClientRect();
    select({
      column: Math.floor(wrap(view.x + (event.clientX - rect.left) / rect.width * columns / view.zoom, columns)),
      row: clamp(Math.floor(view.y + (event.clientY - rect.top) / rect.height * rows / view.zoom), 0, rows - 1),
    });
  }

  function stepCell(event: KeyboardEvent<HTMLCanvasElement>) {
    const shifts: Record<string, [number, number]> = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
    const shift = shifts[event.key];
    if (!shift) return;
    event.preventDefault();
    select({ row: clamp(cell.row + shift[0], 0, rows - 1), column: wrap(cell.column + shift[1], columns) }, true);
  }

  const record = detail?.row === cell.row ? detail.values[cell.column] : null;
  const [rate, intercept, annual] = record ?? [null, null, []];
  const validYears = annual.flatMap((value, index) => value === null ? [] : [firstYear + index]);
  const complete = validYears.length;
  const firstValid = validYears[0];
  const lastValid = validYears.at(-1);
  const chart = annual.map((value, index) => ({
    year: firstYear + index,
    temperature_c: value,
    fitted_c: rate === null || intercept === null || lastValid === undefined || firstYear + index < firstValid || firstYear + index > lastValid
      ? null : intercept + (rate * index) / 10,
  }));

  function download() {
    if (!record) return;
    const data = {
      schema_version: manifest.schema_version, dataset: manifest.dataset, source: manifest.source,
      first_source_month: manifest.metadata.source_coverage[0], last_source_month: manifest.metadata.source_coverage[1],
      baseline: manifest.baseline, period, latitude, longitude, annual_complete_years: complete,
      valid_years: validYears,
      smoothing_km: manifest.smoothing_km, resolution_degrees: step,
      trend_method: manifest.trend_method, slope_c_per_decade: rate, intercept_c_at_period_start: intercept,
      annual_anomalies: chart.map(point => ({ year: point.year, anomaly_c: point.temperature_c })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
    const element = document.createElement("a");
    element.href = url;
    element.download = `gistemp-${latitude}-${longitude}-${firstYear}-${lastYear}.json`;
    element.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="scan-layout">
    <figure className="panel scan-map">
      <figcaption><div><h3>Global surface temperature trends</h3><p>NASA GISTEMP v4 LOTI · {firstYear}–{lastYear}</p></div><span>{manifest.valid_cells.toLocaleString("en-US")} analyzed cells</span></figcaption>
      <div className="scan-viewport">
        <canvas aria-label="World Scan grid. Select a cell with the pointer or move the selection with the arrow keys." tabIndex={0}
          ref={canvas} width={1080} height={540} data-zoom={view.zoom} data-map-ready={!!grid}
          onKeyDown={stepCell}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, origin: view, moved: false };
          }}
          onPointerMove={move} onPointerUp={event => { if (event.isPrimary && drag.current) pick(event); }}
          onLostPointerCapture={() => { drag.current = null; }} />
        {!grid && <div className="scan-message" role="status">{mapError ? "The trend grid did not load." : "Loading NASA trend grid…"}</div>}
        <div className="map-buttons">
          <button type="button" disabled={view.zoom >= 8} aria-label="Zoom in" onClick={() => changeZoom(view.zoom * 2)}>+</button>
          <button type="button" disabled={view.zoom <= 1} aria-label="Zoom out" onClick={() => changeZoom(view.zoom / 2)}>−</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>Reset</button>
        </div>
      </div>
      <div className="geo-legend scan-legend" aria-label="Trend classes in degrees Celsius per decade">
        {colors.map(color => <span key={color.label}><i style={{background: color.fill}} />{color.label}</span>)}
        <span>°C/decade</span><span><i style={{background: noData}} />Insufficient data</span>
      </div>
      <form className="scan-coordinate-form" onSubmit={event => {
        event.preventDefault();
        select(toCell(Number(input.latitude), Number(input.longitude)), true);
      }}>
        <label>Latitude<input type="number" min="-90" max="90" step="any" required value={input.latitude} onChange={event => setInput({ ...input, latitude: event.target.value })} /></label>
        <label>Longitude<input type="number" min="-180" max="180" step="any" required value={input.longitude} onChange={event => setInput({ ...input, longitude: event.target.value })} /></label>
        <button type="submit">Go to cell</button>
      </form>
      {(mapError || detailError) && <button className="scan-retry secondary-action" type="button" onClick={() => {
        setMapError(false);
        setDetailError(false);
        setRetry(retry + 1);
      }}>Retry loading NASA data</button>}
    </figure>
    <aside className="panel location-card scan-cell" aria-labelledby="scan-cell-title">
      <p className="eyebrow">Selected 2° grid cell</p>
      <h3 id="scan-cell-title" aria-live="polite">{caption}</h3>
      <dl className="selected-meta">
        <div><dt>Dataset</dt><dd>GISTEMP v4 LOTI</dd></div>
        <div><dt>Analysis window</dt><dd>{firstYear}–{lastYear}</dd></div>
        {complete > 0 && <div><dt>Years represented</dt><dd>{firstValid}–{lastValid}</dd></div>}
        <div><dt>Complete years</dt><dd>{record ? complete + " / " + totalYears : "—"}</dd></div>
        <div><dt>Linear trend</dt><dd data-testid="scan-slope">{rate === null ? "Unavailable" : signed(rate) + " °C/decade"}</dd></div>
      </dl>
      <p className="scan-cell-status" role="status">{record ? rate === null ? `A slope requires at least ${manifest.minimum_complete_years} complete years.` : "OLS fit on complete calendar years." : detailError ? "Cell details did not load." : "Loading cell history…"}</p>
      <button className="secondary-action" type="button" disabled={!record} onClick={download}>Download cell data ↓</button>
    </aside>
    <figure className="panel chart-panel scan-series">
      <figcaption className="panel-title"><div><p className="eyebrow muted">GISTEMP v4 LOTI · {caption}</p><h3>Annual surface temperature anomalies</h3></div><span className="unit-label">°C</span></figcaption>
      <p>Relative to the NASA 1951–1980 baseline. Each annual mean uses 12 months weighted by calendar days.</p>
      {complete > 0 ? <TemperatureChart points={chart} anomaly /> : <p className="scan-no-series">{record ? "This cell has no complete calendar years in the analysis period." : "Annual series pending."}</p>}
      {complete > 0 && <div className="legend"><span><i className="legend-line" />Annual anomaly</span>{rate !== null && <span><i className="legend-line legend-fit" />OLS fit</span>}</div>}
    </figure>
    <div className="panel source-detail scan-source">
      <h3>Source and limits</h3>
      <p>NASA Goddard Institute for Space Studies. LOTI combines land-surface air temperature with ERSSTv5 sea-surface temperature. Its 1,200 km smoothing makes neighboring 2° cells spatially dependent.</p>
      <p>Slopes describe linear change over the available years. The map shows descriptive estimates. Cell-level confidence intervals are omitted. Local Investigations uses NASA POWER’s separate MERRA-2-derived 2-meter air temperature series.</p>
      <div className="source-links"><a href="https://data.giss.nasa.gov/gistemp/data_v4.html">NASA GISTEMP documentation ↗</a><a href={manifest.source.url}>Original NetCDF archive ↗</a></div>
    </div>
  </div>;
}
