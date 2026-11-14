"use client";

import { useState } from "react";
import type { PointerEvent } from "react";
import { signed } from "./stress-format";

export type MapSite = {
  id: string;
  location: { city: string };
  country?: string;
  continent?: string;
  latitude: number;
  longitude: number;
  windows: { trend: { slope_c_per_decade: number } }[];
};

const bands = [
  { ceiling: -0.05, label: "≤ −0.05", color: "#94b9ff" },
  { ceiling: 0.05, label: "> −0.05 to +0.05", color: "#91abaf" },
  { ceiling: 0.35, label: "> +0.05 to +0.35", color: "#69e0c7" },
  { ceiling: Infinity, label: "> +0.35", color: "#ffbd80" },
];
const project = (lat: number, lon: number) => [(lon + 180) / 360 * 960, (84 - lat) * 960 / 360];
const color = (slope: number) => bands.find(band => slope <= band.ceiling)?.color;
const size = { width: 960, height: 386 };
const folded = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function WorldMap({ stations, selected, select }: {
  stations: MapSite[];
  selected: string;
  select: (id: string) => void;
}) {
  const [continent, setContinent] = useState("");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; unit: number } | null>(null);
  const eligible = stations.filter(site => (!continent || site.continent === continent)
    && folded(site.location.city + " " + site.country).includes(folded(search.trim())));
  const continents = [...new Set(stations.map(site => site.continent))].sort();
  const width = size.width / zoom;
  const height = size.height / zoom;

  function limit(x: number, y: number, scale: number) {
    setOffset({
      x: Math.max(0, Math.min(size.width - size.width / scale, x)),
      y: Math.max(0, Math.min(size.height - size.height / scale, y)),
    });
  }
  function scale(target: number) {
    const next = Math.min(4, Math.max(1, target));
    limit(offset.x + (width - size.width / next) / 2, offset.y + (height - size.height / next) / 2, next);
    setZoom(next);
  }
  function pan(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    limit(offset.x + (drag.x - event.clientX) * drag.unit, offset.y + (drag.y - event.clientY) * drag.unit, zoom);
    setDrag({ ...drag, x: event.clientX, y: event.clientY });
  }

  return (
    <figure className="panel atlas-map">
      <figcaption><div><h3>World temperature atlas</h3><span>Sampled grid cells · 1981–2025 linear slopes</span></div><span>{eligible.length} of {stations.length} locations</span></figcaption>
      <div className="atlas-filters">
        <label>Search locations<input type="search" placeholder="City or country" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Continent<select value={continent} onChange={event => setContinent(event.target.value)}>
          <option value="">All continents</option>{continents.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Location<select value={eligible.some(site => site.id === selected) ? selected : ""} onChange={event => select(event.target.value)}>
          <option value="" disabled>{eligible.length ? "Select a location" : "No locations found"}</option>
          {eligible.map(site => <option value={site.id} key={site.id}>{site.location.city}, {site.country}</option>)}
        </select></label>
      </div>
      <div className="atlas-viewport">
        <svg aria-label="World map of sampled NASA POWER grid points" viewBox={`${offset.x} ${offset.y} ${width} ${height}`}
          className={zoom > 1 ? "can-pan" : ""}
          onPointerDown={event => {
            if (zoom === 1 || (event.target as SVGElement).closest("g[data-point]")) return;
            const unit = width / event.currentTarget.getBoundingClientRect().width;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: event.clientX, y: event.clientY, unit });
          }} onPointerMove={pan} onLostPointerCapture={() => setDrag(null)}>
          <image aria-hidden="true" href="/atlas-land.svg" width={960} height={386} />
          {eligible.map(site => {
            const [x, y] = project(site.latitude, site.longitude);
            const slope = site.windows[0].trend.slope_c_per_decade;
            const label = `${site.location.city}, ${signed(slope)} °C per decade`;
            const radius = (site.id === selected ? 6.5 : 5) / zoom;
            return <g key={site.id} data-point role="button" tabIndex={0} aria-label={label} aria-pressed={site.id === selected}
              onClick={() => select(site.id)} onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(site.id);
                }
              }}>
              <title>{label}</title>
              <circle cx={x} cy={y} r={12 / zoom} fill="transparent" />
              {site.id === selected && <circle cx={x} cy={y} r={radius + 3 / zoom} fill="none" stroke="#f4f9ff" vectorEffect="non-scaling-stroke" />}
              <circle className="atlas-dot" cx={x} cy={y} r={radius} fill={color(slope)} stroke="#09161f" strokeWidth="1.35" vectorEffect="non-scaling-stroke" />
            </g>;
          })}
        </svg>
        <div className="map-buttons">
          <button type="button" disabled={zoom >= 4} onClick={() => scale(zoom * 1.5)} aria-label="Zoom in">+</button>
          <button type="button" disabled={zoom <= 1} onClick={() => scale(zoom / 1.5)} aria-label="Zoom out">−</button>
          <button type="button" disabled={zoom <= 1} onClick={() => scale(1)}>Reset</button>
        </div>
      </div>
      <div className="geo-legend atlas-legend" aria-label="Slope legend in degrees Celsius per decade">
        {bands.map(band => <span key={band.label}><i style={{ background: band.color }} />{band.label}</span>)}
        <span>°C/decade</span>
      </div>
    </figure>
  );
}
