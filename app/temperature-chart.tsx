"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";

export type ChartPoint = { year: number; temperature_c: number | null; fitted_c: number | null; comparison_c?: number | null };
type SeriesKey = "temperature_c" | "comparison_c" | "fitted_c";

const observed = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const degrees = (value: number | null | undefined) => observed(value) ? value.toFixed(2) + " °C" : "Unavailable";

export function TemperatureChart({
  points, window: selectedWindow, comparisonName, anomaly = false, primaryName,
}: {
  points: ChartPoint[];
  window?: { start: number; end: number };
  comparisonName?: string;
  anomaly?: boolean;
  primaryName?: string;
}) {
  const rangeId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 260 });
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width > 0 && height > 0) setSize(previous =>
        previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  const series: { key: SeriesKey; label: string; className: string }[] = [
    { key: "temperature_c", label: primaryName ?? (anomaly ? "Annual anomaly" : "Annual mean"), className: "series-observed" },
  ];
  if (comparisonName) series.push({ key: "comparison_c", label: comparisonName, className: "series-comparison" });
  if (points.some(point => observed(point.fitted_c))) {
    series.push({ key: "fitted_c", label: "OLS fit", className: "series-fit" });
  }
  const values = points.flatMap(point => series.map(item => point[item.key]).filter(observed));
  if (!values.length) return <p className="chart-no-data">No annual values are available for this chart.</p>;

  const first = points[0].year;
  const last = points[points.length - 1].year;
  const { width, height } = size;
  const left = width < 360 ? 44 : 55;
  const right = width - 19;
  const top = 15;
  const bottom = height - 25;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const targetStep = Math.max(0.5, maximum - minimum) / 4;
  const tickUnit = 10 ** Math.floor(Math.log10(targetStep));
  const tickStep = ([1, 2, 2.5, 5, 10].find(step => step * tickUnit >= targetStep) ?? 10) * tickUnit;
  const lowTick = Math.floor(minimum / tickStep);
  const highTick = Math.max(lowTick + 2, Math.ceil(maximum / tickStep));
  const lower = lowTick * tickStep;
  const upper = highTick * tickStep;
  const x = (year: number) => left + (right - left) * (last === first ? 0.5 : (year - first) / (last - first));
  const y = (value: number) => bottom - (bottom - top) * (value - lower) / (upper - lower);
  const division = width >= 540 ? 5 : width >= 340 ? 3 : 2;
  const xTicks = [...new Set(Array.from({ length: division + 1 }, (_, i) => Math.round(first + (last - first) * i / division)))];
  const yTicks = Array.from({ length: highTick - lowTick + 1 }, (_, i) => (lowTick + i) * tickStep);
  const start = Math.max(first, selectedWindow?.start ?? first);
  const end = Math.min(last, selectedWindow?.end ?? last);
  const showWindow = selectedWindow && start < end;
  const defaultYear = points.findLast(point => point.year >= start && point.year <= end && observed(point.temperature_c))?.year ?? last;
  const pinned = picked !== null && picked >= first && picked <= last ? picked : defaultYear;
  const pinnedPoint = points.find(point => point.year === pinned) ?? points[points.length - 1];
  const inspected = points.find(point => point.year === hover) ?? pinnedPoint;
  const frameKey = [series[0].label, comparisonName, first, last].join("|");
  const windowKey = [frameKey, start, end].join("|");


  function pathFor(key: SeriesKey) {
    let connected = false;
    const commands: string[] = [];
    for (const point of points) {
      const value = point[key];
      if (observed(value)) commands.push((connected ? "L" : "M") + x(point.year) + "," + y(value));
      connected = observed(value);
    }
    return commands.join(" ");
  }

  function pointerYear(event: MouseEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = (event.clientX - bounds.left) * width / bounds.width;
    const row = (event.clientY - bounds.top) * height / bounds.height;
    if (column < left || column > right || row < top || row > bottom) return null;
    return Math.round(first + (last - first) * (column - left) / (right - left));
  }

  return <div className="trend-explorer" role="group" aria-label={anomaly ? "Annual temperature anomalies in degrees Celsius" : "Annual mean air temperature in degrees Celsius"}>
    <div ref={frame} className="chart trend-chart">
      <svg viewBox={"0 0 " + width + " " + height} className="trend-svg" aria-hidden="true"
        onPointerMove={event => { if (event.pointerType !== "touch") setHover(pointerYear(event)); }}
        onPointerLeave={() => setHover(null)}
        onClick={event => { const year = pointerYear(event); if (year !== null) { setPicked(year); setHover(null); } }}>
        <rect x={left} y={top} width={right - left} height={bottom - top} fill="transparent" />
        {showWindow && <rect key={windowKey} data-testid="selected-window-plot" className="trend-window"
          x={x(start)} y={top} width={x(end) - x(start)} height={bottom - top} />}
        {yTicks.map(value => <g key={value}>
          <line className="trend-grid-line" x1={left} x2={right} y1={y(value)} y2={y(value)} />
          <text className="trend-axis" x={left - 7} y={y(value)} textAnchor="end" dominantBaseline="middle">{Number(value.toFixed(3))}</text>
        </g>)}
        {anomaly && lower < 0 && upper > 0 && <line className="trend-zero" x1={left} x2={right} y1={y(0)} y2={y(0)} />}
        {xTicks.map(year => <text key={year} className="trend-axis" x={x(year)} y={bottom + 17} textAnchor="middle">{year}</text>)}
        <g key={frameKey} className="trend-reveal">
          {series.filter(item => item.key !== "fitted_c").map(item => <g key={item.key} className={item.className}>
            <path className="trend-series-line" d={pathFor(item.key)} />
            {points.map(point => {
              const value = point[item.key];
              return observed(value) && <circle key={point.year} className="trend-sample" cx={x(point.year)} cy={y(value)} r={1.55} />;
            })}
          </g>)}
        </g>
        {series.some(item => item.key === "fitted_c") && <path key={windowKey} className="trend-series-line series-fit trend-fit-reveal" d={pathFor("fitted_c")} />}
        <line className="trend-crosshair" x1={x(inspected.year)} x2={x(inspected.year)} y1={top} y2={bottom} />
        {series.map(item => {
          const value = inspected[item.key];
          return observed(value) && <circle key={item.key} className={"trend-cursor-point " + item.className}
            cx={x(inspected.year)} cy={y(value)} r={4} />;
        })}
      </svg>
    </div>
    <div className="trend-inspector">
      <div className="trend-scrubber">
        <label htmlFor={rangeId}>Inspect year</label>
        {showWindow && <span className="trend-window-key">Analysis window {start}–{end}</span>}
        <input id={rangeId} type="range" min={first} max={last} step="1" value={pinned} disabled={first === last}
          aria-valuetext={[pinned, ...series.map(item => item.label + " " + degrees(pinnedPoint[item.key]))].join(", ")} onChange={event => { setHover(null); setPicked(Number(event.target.value)); }} />
      </div>
      <div className="trend-readout" data-year={inspected.year} data-hover={hover !== null}>
        <strong className="trend-year">{inspected.year}</strong>
        <dl>
          {series.map(item => <div key={item.key} className={item.className}>
            <dt><i aria-hidden="true" />{item.label}</dt><dd>{degrees(inspected[item.key])}</dd>
          </div>)}
        </dl>
      </div>
    </div>
  </div>;
}
