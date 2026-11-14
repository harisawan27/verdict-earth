"use client";

import { useEffect, useId, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type ChartPoint = { year: number; temperature_c: number | null; fitted_c: number | null; comparison_c?: number | null };

export function TemperatureChart({
  points, window: selectedWindow, comparisonName, anomaly = false,
}: {
  points: ChartPoint[];
  window?: { start: number; end: number };
  comparisonName?: string;
  anomaly?: boolean;
}) {
  const gradient = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 680px)");
    function update() {
      setWide(query.matches);
    }
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const values = points.flatMap(({ temperature_c, fitted_c, comparison_c }) =>
    [temperature_c, fitted_c, comparison_c].filter((value): value is number => typeof value === "number")
  );
  const domain: [number, number] = [
    Math.floor(Math.min(...values) * 2) / 2,
    Math.max(Math.floor(Math.min(...values) * 2) / 2 + 0.5, Math.ceil(Math.max(...values) * 2) / 2),
  ];
  const [first, last] = [points[0].year, points[points.length - 1].year];
  const windowBand = selectedWindow && last > first && (selectedWindow.start > first || selectedWindow.end < last);
  const steps = wide ? 5 : 3;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => (
    Math.round(first + (last - first) * i / steps)
  )).filter((year, i, years) => i === 0 || year !== years[i - 1]);

  return (
    <div className="chart" role="group" aria-label={anomaly ? "Annual temperature anomalies and linear fit" : "Annual mean air temperature and fitted linear trend"}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={points} margin={{ top: 12, right: 18, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5de2c4" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#5de2c4" stopOpacity={0.015} />
            </linearGradient>
          </defs>
          {windowBand && selectedWindow && (
            <ReferenceArea x1={selectedWindow.start} x2={selectedWindow.end} ifOverflow="hidden"
              shape={({ x, y, width, height }) => (
                <rect data-testid="selected-window-plot" x={x} y={y} width={width} height={height}
                  fill="#71e8cb" fillOpacity={0.11} pointerEvents="none" />
              )} />
          )}
          <CartesianGrid vertical={false} stroke="#283841" strokeDasharray="3 5" />
          <XAxis dataKey="year" type="number" domain={[first, last]} allowDataOverflow ticks={ticks}
            axisLine={false} tickLine={false} tickMargin={12} tick={{ fill: "#9aafb9", fontSize: 12 }} />
          <YAxis domain={domain} tickCount={5} width={49}
            axisLine={false} tickLine={false} tickMargin={7} tick={{ fill: "#9aafb9", fontSize: 12 }}
            tickFormatter={(value: number) => value.toFixed(1)} />
          <Tooltip
            cursor={{ stroke: "#617780", strokeDasharray: "4 4" }}
            contentStyle={{ background: "#111e26", border: "1px solid #354b56", borderRadius: 10 }}
            labelStyle={{ color: "#f1f8f7", marginBottom: 4, fontWeight: 650 }}
            formatter={(value) => typeof value !== "number" ? "Unavailable" : value.toFixed(2) + " °C"}
            labelFormatter={(year) => "Year " + year}
          />
          <Area type="linear" dataKey="temperature_c" name={anomaly ? "Annual anomaly" : "Annual mean"} fill={`url(#${gradient})`}
            stroke="#66e8cb" strokeWidth={2.35} activeDot={{ r: 4, stroke: "#0c151b" }}
            baseValue={domain[0]} isAnimationActive={false} connectNulls={false} />
          {comparisonName && (
            <Line type="linear" dataKey="comparison_c" name={comparisonName} stroke="#f4bc83" strokeWidth={2}
              dot={false} isAnimationActive={false} connectNulls={false} />
          )}
          <Line type="linear" dataKey="fitted_c" name="OLS fit" stroke="#a5baff" strokeWidth={1.75}
            strokeDasharray="6 5" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
