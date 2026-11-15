"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { loadGeography, searchedPlaceLabel } from "./scan-geography";
import type { Geography } from "./scan-geography";
import { PlaceSearch } from "./scan-place-search";
import type { Station } from "./investigation";

export type PowerPoint = { latitude: number; longitude: number; label: string };

export function PowerPointPicker({ stations, value, select, choose, status, secondary = false }: {
  stations: Station[];
  value: string;
  select: (id: string) => void;
  choose: (point: PowerPoint) => void;
  status: { pending: boolean; message: string };
  secondary?: boolean;
}) {
  const [geo, setGeo] = useState<Geography | null>(null);
  const [geoFailed, setGeoFailed] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  useEffect(() => {
    let mounted = true;
    loadGeography().then(result => { if (mounted) setGeo(result); })
      .catch(() => { if (mounted) setGeoFailed(true); });
    return () => { mounted = false; };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lat = Number(latitude), lon = Number(longitude);
    choose({ latitude: lat, longitude: lon, label: lat + "°, " + lon + "°" });
  }

  return <div className="power-picker">
    <PlaceSearch geo={geo} failed={geoFailed} label={secondary ? "Find a comparison place" : "Find a POWER location"}
      unavailableText="Place search is unavailable. You can still enter coordinates or choose an archived sample."
      choose={place => choose({ latitude: place[6], longitude: place[5], label: searchedPlaceLabel(place) })} />
    <details className="power-picker-options">
      <summary>{secondary ? "Other comparison options" : "Enter coordinates or choose an archived sample"}</summary>
      <form className="power-coordinates" onSubmit={submit}>
        <label>Latitude<input type="number" min="-90" max="90" step="any" required value={latitude}
          onChange={event => setLatitude(event.target.value)} placeholder="41.01" /></label>
        <label>Longitude<input type="number" min="-180" max="180" step="any" required value={longitude}
          onChange={event => setLongitude(event.target.value)} placeholder="28.95" /></label>
        <button type="submit" className="workspace-secondary">Load point</button>
      </form>
      <label className="power-archive">Archived sample<select value={stations.some(site => site.id === value) ? value : ""}
        onChange={event => select(event.target.value)}>
        <option value="" disabled>Choose a sample</option>
        {stations.map(site => <option key={site.id} value={site.id}>{site.location.city}</option>)}
      </select></label>
    </details>
    {secondary && value && <button type="button" className="workspace-secondary" onClick={() => select("")}>Clear comparison</button>}
    {status.message && <p className="power-request" role="status" data-pending={status.pending}>{status.message}</p>}
  </div>;
}
