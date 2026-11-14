"use client";

import { useState } from "react";
import type { Calendar } from "./investigation";
import { interval, signed } from "./stress-format";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type IntervalRow = {
  label: string;
  rate: number;
  ci: number[] | null;
  selected: boolean;
  count?: number;
  select?: () => void;
};

export function IntervalPlot({ rows }: { rows: IntervalRow[] }) {
  const values = rows.flatMap(row => [row.rate, ...(row.ci ?? [])]);
  const bound = Math.max(0.1, ...values.map(Math.abs)) * 1.12;
  const position = (value: number) => `${50 + (value / bound) * 50}%`;
  return <div className="interval-plot" aria-label="Trend slope intervals in degrees Celsius per decade">
    <div className="interval-axis"><span>{signed(-bound)}</span><span>0</span><span>{signed(bound)}</span></div>
    {rows.map(row => {
      const contents = <>
        <span className="interval-label">{row.label}{row.count !== undefined && <small>{row.count} years</small>}</span>
        <span className="interval-track" aria-hidden="true">
          {row.ci && <i className="interval-range" style={{ left: position(row.ci[0]), right: position(-row.ci[1]) }} />}
          <i className="interval-point" style={{ left: position(row.rate) }} />
        </span>
        <span className="interval-value">{signed(row.rate)}<small>{interval(row.ci)}</small></span>
      </>;
      return row.select
        ? <button type="button" className="interval-row" key={row.label} aria-pressed={row.selected} onClick={row.select}>{contents}</button>
        : <div className="interval-row" key={row.label} data-active={row.selected}>{contents}</div>;
    })}
  </div>;
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
  const year = Math.max(calendar.first_year, Math.min(lastYear, selection.year));
  const month = selection.month;
  const index = (year - calendar.first_year) * 12 + month;
  const anomaly = calendar.anomaly_c[index];
  const actual = calendar.temperature_c[index];
  const normal = calendar.baseline_c[month];
  const years = Array.from({ length: lastYear - calendar.first_year + 1 }, (_, offset) => lastYear - offset);
  return <figure className="panel anomaly-panel">
    <figcaption className="panel-title">
      <div><p className="eyebrow muted">{city} · NASA POWER</p><h3>Monthly temperature anomalies</h3></div><span className="unit-label">°C</span>
    </figcaption>
    <p>Each month is compared with the {calendar.baseline_years.join("–")} mean for that same month at this grid cell.</p>
    <div className="anomaly-key">
      {[-3, -1.5, 0, 1.5, 3, null].map(value => <span key={String(value)}><i style={{ background: anomalyColor(value) }} />{value === null ? "Missing" : value === -3 ? "≤ −3" : value === 3 ? "≥ +3" : signed(value, 1)}</span>)}
    </div>
    <div className="calendar-interaction">
      <label>Year<select value={year} onChange={event => setSelection({ year: Number(event.target.value), month })}>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Month<select value={month} onChange={event => setSelection({ year, month: Number(event.target.value) })}>{months.map((label, value) => <option key={label} value={value}>{label}</option>)}</select></label>
      <p aria-live="polite"><strong>{months[month]} {year} · {anomaly === null ? "Anomaly unavailable" : `${signed(anomaly, 2)} °C anomaly`}</strong>
        {actual !== null && normal !== null && <span>{actual.toFixed(2)} °C monthly mean · {normal.toFixed(2)} °C baseline</span>}</p>
    </div>
    <div className="calendar-scroll">
      <table className="calendar-table">
        <thead><tr><th scope="col">Year</th>{months.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{years.map(value => <tr key={value}>
          <th scope="row">{value}</th>
          {months.map((label, column) => {
            const item = calendar.anomaly_c[(value - calendar.first_year) * 12 + column];
            const name = `${label} ${value}: ${item === null ? "unavailable" : signed(item, 2) + " °C anomaly"}`;
            return <td key={label} className={value === year && column === month ? "calendar-selected" : ""}>
              <button type="button" tabIndex={-1} aria-label={name} title={name} onClick={() => setSelection({ year: value, month: column })} style={{ background: anomalyColor(item) }} />
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
