"use client";

import { useId, useState } from "react";
import { searchPlaces } from "./scan-geography";
import type { Geography, Place, PlaceContext } from "./scan-geography";

export function placeTitle(context: PlaceContext) {
  if (context.ambiguous) return context.disputed?.[0] ?? "Boundary area";
  if (context.city && context.country) return `Near ${context.city[0]}, ${context.country[0]}`;
  return context.country?.[0] ?? context.marine?.[0] ?? "Offshore / open water";
}

export function placeDetail(context: PlaceContext) {
  if (context.ambiguous) return "Natural Earth indicates disputed or ambiguous boundaries here.";
  if (!context.country) return context.marine ? "Marine geographic reference" : "No named geographic area in Natural Earth at this point.";
  const region = context.region?.[0] ?? context.city?.[4];
  const broaderArea = context.country[4] || context.country[3];
  return [...new Set([region, broaderArea, context.country[3]].filter(Boolean))].join(" · ");
}

export function PlaceSearch({ geo, failed, choose }: { geo: Geography | null; failed: boolean; choose: (place: Place) => void }) {
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = open && geo ? searchPlaces(geo.places, query) : [];
  function select(place: Place) {
    choose(place);
    setQuery(place[0]);
    setOpen(false);
  }
  return <div className="scan-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={resultsId + "-input"}>Find a place</label>
    <input id={resultsId + "-input"} type="search" autoComplete="off" role="combobox" aria-autocomplete="list"
      aria-expanded={results.length > 0} aria-controls={resultsId}
      aria-activedescendant={results[active] ? resultsId + "-" + results[active].id : undefined}
      placeholder="Search countries, cities or regions..." value={query}
      onFocus={() => { setOpen(true); setActive(0); }}
      onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={event => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          setActive(results.length ? (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
        }
        if (event.key === "Enter" && results[active]) {
          event.preventDefault();
          select(results[active].place);
        }
      }} />
    <ul id={resultsId} className="scan-search-results" role="listbox" aria-label="Matching places" hidden={!results.length}>
      {results.map(({id, place}, index) => <li id={resultsId + "-" + id} key={id} role="option" aria-selected={index === active}
        onMouseDown={event => event.preventDefault()} onClick={() => select(place)}>
        <strong>{place[0]}</strong><span>{place[1] === "country" ? place[3] : [place[4], place[3]].filter((v, i, a) => v && a.indexOf(v) === i).join(" · ")}</span>
      </li>)}
    </ul>
    {open && query.trim() && !results.length && <p className="scan-search-status" role="status">
      {failed ? "Place search unavailable. You can still use the map or coordinates." : geo ? "No matching place in Natural Earth." : "Loading places…"}
    </p>}
  </div>;
}
