"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Calendar } from "./investigation";
import { includesZero, interval, signed } from "./stress-format";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type IntervalRow = {
  label: string;
  rate: number;
  ci: number[] | null;
  selected: boolean;
  count?: number;
  description?: string;
  select?: () => void;
};

export function slopeAxis(values: number[]) {
  const magnitude = Math.max(0.1, ...values.map(Math.abs)) * 1.08;
  const unit = 10 ** Math.floor(Math.log10(magnitude));
  return ([1, 2, 2.5, 5, 10].find(step => step * unit >= magnitude) ?? 10) * unit;
}

export function IntervalPlot({ rows, bound, methods = false }: { rows: IntervalRow[]; bound: number; methods?: boolean }) {
  const position = (value: number) => (50 + (value / bound) * 50) + "%";
  const selected = rows.find(row => row.selected);
  return <figure className="interval-plot" data-mode={methods ? "methods" : "windows"} data-axis={bound}>
    <figcaption className="interval-caption">
      <strong>{methods ? "Nominal 95% intervals" : "Nominal 95% intervals by period"}</strong>
      <span>°C per decade · dot = slope · dashed line = zero</span>
    </figcaption>
    <div className="interval-axis" aria-hidden="true"><div><span>{signed(-bound, 2)}</span><span>0</span><span>{signed(bound, 2)}</span></div></div>
    {rows.map(row => {
      const zero = includesZero(row.ci);
      const contents = <>
        <span className="interval-label">{row.label}{row.count !== undefined && <small>{row.count} complete years</small>}</span>
        <span className="interval-track" aria-hidden="true" key={bound}>
          {row.ci && <i className="interval-range" style={{ left: position(row.ci[0]), right: position(-row.ci[1]) }} />}
          <i className="interval-point" style={{ left: position(row.rate) }} />
        </span>
        <span className="interval-value"><strong>{signed(row.rate)}</strong><small>{interval(row.ci)}</small>
          {methods && zero !== null && <small className="interval-zero-status">{zero ? "Includes zero" : "Excludes zero"}</small>}</span>
      </>;
      return row.select
        ? <button type="button" className="interval-row" key={row.label} aria-pressed={row.selected} onClick={row.select}>{contents}</button>
        : <div className="interval-row" key={row.label} data-active={row.selected}>{contents}</div>;
    })}
    {selected?.description && <p className="interval-explanation" aria-live="polite"><strong>{selected.label}.</strong> {selected.description}</p>}
  </figure>;
}

export function SlopeComparison({ rows, context, paired = true }: { rows: { label: string; rate: number }[]; context: string; paired?: boolean }) {
  const bound = slopeAxis(rows.map(row => row.rate));
  return <figure className="interval-plot slope-comparison" data-axis={bound}>
    <figcaption className="interval-caption"><strong>Fitted slopes</strong><span>°C per decade · {context}</span></figcaption>
    <div className="interval-axis" aria-hidden="true"><div><span>{signed(-bound, 2)}</span><span>0</span><span>{signed(bound, 2)}</span></div></div>
    {rows.map(({ label, rate }, index) => <div className="interval-row" data-series={paired && index === 1 ? "comparison" : undefined} key={index}>
      <span className="interval-label">{label}</span>
      <span className="interval-track" aria-hidden="true" key={bound}>
        <i className="slope-stem" style={{ left: Math.min(50, 50 + (rate / bound) * 50) + "%", width: Math.abs(rate / bound * 50) + "%" }} />
        <i className="interval-point" style={{ left: 50 + (rate / bound) * 50 + "%" }} />
      </span>
      <span className="interval-value"><strong>{signed(rate)}</strong></span>
    </div>)}
  </figure>;
}

function anomalyColor(value: number | null) {
  if (value === null) return "#182630";
  const strength = Math.min(Math.abs(value) / 3, 1);
  const color = value < 0 ? "#80b5f8" : "#ffb278";
  return `color-mix(in srgb, ${color} ${12 + 88 * strength}%, #263746)`;
}

export function AnomalyCalendar({ calendar, city }: { calendar: Calendar; city: string }) {
  const lastYear = calendar.first_year + calendar.anomaly_c.length / 12 - 1;
  const [selection, setSelection] = useState({ year: lastYear, month: 0 });
  const [preview, setPreview] = useState<{ year: number; month: number } | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const year = Math.max(calendar.first_year, Math.min(lastYear, selection.year));
  const month = selection.month;
  const inspected = preview ?? { year, month };
  const cellIndex = (year: number, month: number) => (year - calendar.first_year) * 12 + month;
  const index = cellIndex(inspected.year, inspected.month);
  const anomaly = calendar.anomaly_c[index];
  const actual = calendar.temperature_c[index];
  const normal = calendar.baseline_c[inspected.month];
  const years = Array.from({ length: lastYear - calendar.first_year + 1 }, (_, offset) => lastYear - offset);
  function choose(year: number, month: number) {
    setPreview(null);
    setSelection({ year, month });
  }

  function moveCell(event: KeyboardEvent<HTMLButtonElement>, year: number, month: number) {
    const next = { year, month };
    switch (event.key) {
      case "ArrowLeft": next.month = Math.max(0, month - 1); break;
      case "ArrowRight": next.month = Math.min(11, month + 1); break;
      case "ArrowUp": next.year = Math.min(lastYear, year + 1); break;
      case "ArrowDown": next.year = Math.max(calendar.first_year, year - 1); break;
      case "Home": next.month = 0; break;
      case "End": next.month = 11; break;
      default: return;
    }
    event.preventDefault();
    choose(next.year, next.month);
    table.current?.querySelector<HTMLButtonElement>('[data-month-index="' + cellIndex(next.year, next.month) + '"]')?.focus();
  }

  return <figure className="panel anomaly-panel">
    <figcaption className="panel-title">
      <div><p className="eyebrow muted">{city} · NASA POWER</p><h3>Monthly temperature anomalies</h3></div><span className="unit-label">°C</span>
    </figcaption>
    <p>Each month is compared with the {calendar.baseline_years.join("–")} mean for that same month at this grid cell. The reference mean requires a valid value for that month in every baseline year.</p>
    <div className="anomaly-key">
      {[-3, -1.5, 0, 1.5, 3, null].map(value => <span key={String(value)}><i style={{ background: anomalyColor(value) }} />{value === null ? "Missing" : value === -3 ? "≤ −3" : value === 3 ? "≥ +3" : signed(value, 1)}</span>)}
    </div>
    <div className="calendar-interaction">
      <label>Year<select value={year} onChange={event => choose(Number(event.target.value), month)}>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Month<select value={month} onChange={event => choose(year, Number(event.target.value))}>{months.map((label, value) => <option key={label} value={value}>{label}</option>)}</select></label>
      <p className="calendar-readout" aria-live={preview ? "off" : "polite"} data-year={inspected.year} data-month={inspected.month}><strong>{months[inspected.month]} {inspected.year} · {anomaly === null ? "Anomaly unavailable" : signed(anomaly, 2) + " °C anomaly"}</strong>
        <span>Monthly mean {actual === null ? "unavailable" : actual.toFixed(2) + " °C"} · baseline {normal === null ? "unavailable" : normal.toFixed(2) + " °C"}</span></p>
    </div>
    <div className="calendar-mobile" key={year} role="group" aria-label={"Monthly anomalies for " + year}>{months.map((label,column) => {
      const value = calendar.anomaly_c[(year-calendar.first_year)*12+column];
      return <button key={label} type="button" aria-pressed={column===month} onClick={() => choose(year, column)}>
        <i aria-hidden="true" style={{background:anomalyColor(value)}}/><span>{label}</span><strong>{value===null ? "—" : signed(value,2) + "°C"}</strong>
      </button>;
    })}</div>
    <div className="calendar-scroll">
      <table ref={table} className="calendar-table" onPointerLeave={() => setPreview(null)}>
        <thead><tr><th scope="col">Year</th>{months.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{years.map(value => <tr key={value} data-selected-year={value === year}>
          <th scope="row">{value}</th>
          {months.map((label, column) => {
            const item = calendar.anomaly_c[(value - calendar.first_year) * 12 + column];
            const name = `${label} ${value}: ${item === null ? "unavailable" : signed(item, 2) + " °C anomaly"}`;
            return <td key={label} className={value === year && column === month ? "calendar-selected" : ""}>
              <button type="button" tabIndex={value === year && column === month ? 0 : -1} aria-label={name} title={name}
                aria-pressed={value === year && column === month} data-month-index={cellIndex(value, column)}
                onPointerEnter={event => { if (event.pointerType !== "touch") setPreview({ year: value, month: column }); }}
                onFocus={() => setPreview({ year: value, month: column })} onBlur={() => setPreview(null)}
                onKeyDown={event => moveCell(event, value, column)} onClick={() => choose(value, column)}
                style={{ background: anomalyColor(item) }} />
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
