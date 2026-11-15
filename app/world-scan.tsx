"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import manifest from "../public/world-scan/v1/manifest.json";
import { signed } from "./stress-format";
import { TemperatureChart } from "./temperature-chart";
import { GlobalEvidence } from "./global-evidence";
import { GlobalStress } from "./global-stress";
import { compareWindows } from "./scan-comparison";
import { descriptiveFit } from "./verdict";
import type { ScanRecord } from "./global-evidence";
import { detailZoom, drawGeography, loadDetailTile, loadGeography, loadPaths, loadRegionalLines, pointerPoint, resolvePlace, searchedPlaceLabel, visibleDetailKeys } from "./scan-geography";
import type { DetailTile, Geography, Place, PlaceContext, Point } from "./scan-geography";
import { PlaceSearch, placeDetail, placeTitle } from "./scan-place-search";
import { useWorkspace } from "./workspace-state";

const base = "/world-scan/v1";
const { rows, columns, missing, map_scale: scale, period, resolution_degrees: step } = manifest;
const [firstYear, lastYear] = period;
const totalYears = lastYear - firstYear + 1;
const colors = [
  { edge: -0.4, fill: "#3f72a7", label: "≤ −0.4" },
  { edge: -0.1, fill: "#699bb8", label: "> −0.4 to −0.1" },
  { edge: 0.1, fill: "#354752", label: "> −0.1 to +0.1" },
  { edge: 0.4, fill: "#a3825b", label: "> +0.1 to +0.4" },
  { edge: 0.7, fill: "#c28155", label: "> +0.4 to +0.7" },
  { edge: Infinity, fill: "#d56859", label: "> +0.7" },
];
const maxZoom = 32;
const noData = "#172535";
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
type Pinned = { cell: Cell; title: string; center: string };
const rowCache = new Map<number, Promise<ScanRecord[]>>();

function loadRow(row: number) {
  const cached = rowCache.get(row);
  if (cached) return cached;
  if (rowCache.size >= 12) rowCache.delete(rowCache.keys().next().value!);
  const request = fetch(base + "/row-" + row + ".json").then(async response => {
    if (!response.ok) throw new Error("GISTEMP cell details");
    const values = await response.json() as ScanRecord[];
    if (values.length !== columns) throw new Error("Unexpected detail row");
    return values;
  }).catch(error => {
    if (rowCache.get(row) === request) rowCache.delete(row);
    throw error;
  });
  rowCache.set(row, request);
  return request;
}

function formatCenter(cell: Cell) {
  const latitude = manifest.first_latitude - cell.row * step;
  const longitude = manifest.first_longitude + cell.column * step;
  return textCoordinate(latitude, "S", "N") + " · " + textCoordinate(longitude, "W", "E");
}

type Drag = { x: number; y: number; origin: View; moved: boolean };

export const scanManifest = manifest;

function sparkline(values: (number | null)[]) {
  const observations = values.filter((value): value is number => value !== null);
  const minimum = Math.min(...observations);
  const range = Math.max(0.01, Math.max(...observations) - minimum);
  return values.map((value, i) => value === null ? "" :
    (values[i - 1] == null ? "M" : "L") + (i * 248 / (values.length - 1)).toFixed(1)
    + " " + (48 - 44 * (value - minimum) / range).toFixed(1)).join(" ");
}

export function WorldScan() {
  const workspace = useWorkspace();
  const route = workspace?.route;
  const updateSummary = workspace?.updateSummary;
  const activeGlobal = !route || route.dataset === "gistemp";
  const showMap = !route || (activeGlobal && route.page === "explore");
  const lab = activeGlobal && route?.page === "evidence";
  const showChart = !route || (lab && route.view === "trend");
  const showComparison = !route || (lab && route.view === "comparison");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const exportCell = useRef<() => void>(() => {});
  const [analysisWindow, setAnalysisWindow] = useState(0);
  const [windowChecks, setWindowChecks] = useState(true);
  const [opacity, setOpacity] = useState(68);
  const [expanded, setExpanded] = useState(false);
  const [pin, setPin] = useState<Pinned | null>(null);
  const [pinDetail, setPinDetail] = useState<{ pin: Pinned; record: ScanRecord } | null>(null);
  const [pinError, setPinError] = useState(false);
  const [geo, setGeo] = useState<Geography | null>(null);
  const [geoFailed, setGeoFailed] = useState(false);
  const [regionPath, setRegionPath] = useState<Path2D | null>(null);
  const [detailedPaths, setDetailedPaths] = useState<{ key: string; tiles: DetailTile[] } | null>(null);
  const [geographicOnly, setGeographicOnly] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [selection, setSelection] = useState<{ point: Point; source: string; searchedPlace?: Place }>({ point: [66.9881, 24.8719], source: "Initial place" });
  const [place, setPlace] = useState<{ point: Point; context: PlaceContext } | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [pixelWidth, setPixelWidth] = useState(1080);
  const [cssWidth, setCssWidth] = useState(1080);
  const labelScale = pixelWidth / cssWidth;
  const [hover, setHover] = useState<{ cell: Cell; label: string } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverTicket = useRef(0);
  const [grid, setGrid] = useState<Int16Array | null>(null);
  const [land, setLand] = useState<HTMLImageElement | null>(null);
  const [coast, setCoast] = useState<HTMLImageElement | null>(null);
  const [mapError, setMapError] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [cell, setCell] = useState<Cell>(() => toCell(25, 67));
  const [input, setInput] = useState({ latitude: "24.8719", longitude: "66.9881" });
  const [detail, setDetail] = useState<{ row: number; values: ScanRecord[] } | null>(null);
  const [detailError, setDetailError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mapPanel = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    function updateFullscreen() { setFullscreen(document.fullscreenElement === mapPanel.current); }
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement === mapPanel.current) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (!mapPanel.current?.requestFullscreen) throw new Error("Fullscreen unavailable");
      await mapPanel.current.requestFullscreen();
    } catch {
      setExpanded(value => !value);
    }
  }
  const raster = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const motion = useRef(0);
  useEffect(() => () => cancelAnimationFrame(motion.current), []);
  const [retry, setRetry] = useState(0);
  const latitude = manifest.first_latitude - cell.row * step;
  const longitude = manifest.first_longitude + cell.column * step;
  const caption = formatCenter(cell);

  useEffect(() => {
    let active = true;
    loadGeography().then(result => {
      if (active) setGeo(result);
      return loadPaths().then(paths => { if (active) setGeo({ ...result, paths }); }).catch(() => {});
    }).catch(() => { if (active) setGeoFailed(true); });
    const node = canvas.current;
    const resize = new ResizeObserver(() => {
      if (!node?.clientWidth) return;
      setCssWidth(node.clientWidth);
      setPixelWidth(2 * Math.round(node.clientWidth * Math.min(window.devicePixelRatio || 1, 3) / 2));
    });
    if (node) resize.observe(node);
    return () => { active = false; resize.disconnect(); clearTimeout(hoverTimer.current); hoverTicket.current++; };
  }, []);

  useEffect(() => {
    if (view.zoom < 4 || regionPath) return;
    let active = true;
    loadRegionalLines().then(path => { if (active) setRegionPath(path); }).catch(() => {});
    return () => { active = false; };
  }, [view.zoom, regionPath]);

  const detailKey = geo && view.zoom >= detailZoom
    ? visibleDetailKeys(view).filter(key => geo.detailKeys.has(key)).join(",") : "";

  useEffect(() => {
    if (!detailKey) return;
    let active = true;
    const timer = setTimeout(() => {
      Promise.allSettled(detailKey.split(",").map(loadDetailTile)).then(results => {
        if (active) setDetailedPaths({ key: detailKey,
          tiles: results.flatMap(result => result.status === "fulfilled" ? [result.value] : []) });
      });
    }, 90);
    return () => { active = false; clearTimeout(timer); };
  }, [detailKey]);

  useEffect(() => {
    if (!geo) return;
    let active = true;
    resolvePlace(selection.point, geo).then(context => {
      if (active) setPlace({ point: selection.point, context });
    }).catch(() => { if (active) setLookupFailed(true); });
    return () => { active = false; };
  }, [geo, selection.point]);

  useEffect(() => {
    if (land) return;
    const image = new Image();
    image.onload = () => setLand(image);
    image.src = "/world-scan/land-reference.svg";
    return () => { image.onload = null; };
  }, [land]);

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
    let active = true;
    loadRow(cell.row).then(values => {
      if (active) setDetail({ row: cell.row, values });
    }).catch(() => { if (active) setDetailError(true); });
    return () => { active = false; };
  }, [cell.row, retry]);

  useEffect(() => {
    if (!pin) return;
    let active = true;
    loadRow(pin.cell.row).then(values => {
      if (active) setPinDetail({ pin, record: values[pin.cell.column] });
    }).catch(() => { if (active) setPinError(true); });
    return () => { active = false; };
  }, [pin, retry]);

  useEffect(() => {
    const drawing = canvas.current?.getContext("2d");
    const image = raster.current;
    if (!showMap || !drawing || !image || !grid) return;
    const context = drawing;
    const { width, height } = context.canvas;
    const factor = width / columns * view.zoom;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.fillStyle = geographicOnly ? "#dceaf0" : "#102030";
    context.fillRect(0, 0, width, height);
    for (const offset of [-columns, 0, columns]) {
      const left = (offset - view.x) * factor;
      const top = -view.y * factor;
      if (land) {
        context.imageSmoothingEnabled = true;
        context.globalAlpha = geographicOnly ? 1 : .14;
        context.drawImage(land, left, top, columns * factor, rows * factor);
        context.globalAlpha = 1;
        context.imageSmoothingEnabled = false;
      }
      if (!geographicOnly) {
        context.globalAlpha = opacity / 100;
        context.drawImage(image, left, top, columns * factor, rows * factor);
        context.globalAlpha = 1;
      }
      if (coast && !geo?.paths[2]) context.drawImage(coast, left, top, columns * factor, rows * factor);
    }
    const matchedCity = place?.point === selection.point ? place.context.city : undefined;
    const searched = selection.searchedPlace;
    const isSearchedCity = searched?.[1] === "city" || searched?.[1] === "capital";
    if (geo) drawGeography(context,
      regionPath ? { ...geo, paths: [geo.paths[0], geo.paths[1], geo.paths[2], regionPath] } : geo,
      view, labelScale, showLabels, isSearchedCity ? searched : matchedCity,
      detailedPaths?.key === detailKey ? detailedPaths.tiles : [], geographicOnly);
    function outline(target: Cell, color: string, letter?: string) {
      for (const offset of [-columns, 0, columns]) {
        const x = (target.column + offset - view.x) * factor;
        const y = (target.row - view.y) * factor;
        context.strokeStyle = color;
        context.lineWidth = labelScale * (letter ? 1.7 : 1);
        context.strokeRect(x, y, factor, factor);
        if (letter && x + factor > 0 && x < width && y + factor > 0 && y < height) {
          const markerX = Math.min(width - 10 * labelScale, Math.max(10 * labelScale, x + factor / 2));
          const markerY = Math.max(11 * labelScale, Math.min(height - 10 * labelScale, y - 10 * labelScale));
          context.fillStyle = "#142633";
          context.beginPath();
          context.arc(markerX, markerY, 9 * labelScale, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          context.fillStyle = "#fff";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.font = "700 " + (11 * labelScale) + "px system-ui";
          context.fillText(letter, markerX, markerY);
          context.textAlign = "start";
        }
      }
    }
    if (hover) outline(hover.cell, geographicOnly ? "#496072" : "#fae1ba");
    if (pin) outline(pin.cell, "#6de5c5", "A");
    const samePin = pin && pin.cell.row === cell.row && pin.cell.column === cell.column;
    if (pin && !samePin) outline(cell, "#ffc78e", "B");
    context.strokeStyle = geographicOnly ? "#17685d" : pin && !samePin ? "#ffc78e" : "#fff";
    context.lineWidth = 1.7 * labelScale;
    for (const offset of [-columns, 0, columns]) {
      const x = (cell.column + offset + 0.5 - view.x) * factor;
      const y = (cell.row + 0.5 - view.y) * factor;
      if (!pin) context.strokeRect(x - factor / 2, y - factor / 2, factor, factor);
      const radius = Math.max(3 * labelScale, factor * 0.18);
      context.beginPath();
      context.arc(x, y, radius, 0, 2 * Math.PI);
      context.stroke();
      const [lon, lat] = selection.point;
      const pointX = (wrap((lon + 180) / step, columns) + offset - view.x) * factor;
      const pointY = ((90 - lat) / step - view.y) * factor;
      context.fillStyle = geographicOnly ? "#17685d" : "#b4fff0";
      context.beginPath();
      context.arc(pointX, pointY, 2 * labelScale, 0, 2 * Math.PI);
      context.fill();
    }
  }, [cell, coast, detailKey, detailedPaths, geo, geographicOnly, grid, hover, labelScale, land, opacity, pin, pixelWidth, place, regionPath, selection, showLabels, showMap, view]);

  function select(next: Cell, center = false, point: Point = [manifest.first_longitude + next.column * step, manifest.first_latitude - next.row * step], source = "Keyboard selection", searchedPlace?: Place) {
    setSelection({ point, source, searchedPlace });
    setLookupFailed(false);
    if (next.row !== cell.row) setDetailError(false);
    setCell(next);
    setInput({
      latitude: String(Number(point[1].toFixed(4))),
      longitude: String(Number(point[0].toFixed(4))),
    });
    if (center && view.zoom > 1) {
      position(next.column + 0.5 - columns / view.zoom / 2, next.row + 0.5 - rows / view.zoom / 2, view.zoom);
    }
  }

  function position(x: number, y: number, zoom: number) {
    setView({ x: wrap(x, columns), y: clamp(y, 0, rows - rows / zoom), zoom });
  }

  function changeZoom(target: number) {
    cancelAnimationFrame(motion.current);
    clearHover();
    const zoom = clamp(target, 1, maxZoom);
    position(view.x + columns / view.zoom / 2 - columns / zoom / 2,
      view.y + rows / view.zoom / 2 - rows / zoom / 2, zoom);
  }

  function clearHover() {
    clearTimeout(hoverTimer.current);
    hoverTicket.current++;
    setHover(null);
  }

  function flyTo(point: Point, zoom: number) {
    cancelAnimationFrame(motion.current);
    const targetX = wrap((point[0] + 180) / step - columns / zoom / 2, columns);
    const targetY = clamp((90 - point[1]) / step - rows / zoom / 2, 0, rows - rows / zoom);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      position(targetX, targetY, zoom);
      return;
    }
    const dx = wrap(targetX - view.x + columns / 2, columns) - columns / 2;
    // Interpolate viewport centers so the selected point stays in view on a zoom.
    const startCenter = view.x + columns / view.zoom / 2;
    const deltaCenter = dx + columns / zoom / 2 - columns / view.zoom / 2;
    const startCenterY = view.y + rows / view.zoom / 2;
    const endCenterY = targetY + rows / zoom / 2;
    const started = performance.now();
    function frame(now: number) {
      const t = Math.min(1, (now - started) / 420);
      const ease = 1 - (1 - t) ** 3;
      const nextZoom = view.zoom * (zoom / view.zoom) ** ease;
      position(startCenter + deltaCenter * ease - columns / nextZoom / 2,
        startCenterY + (endCenterY - startCenterY) * ease - rows / nextZoom / 2, nextZoom);
      if (t < 1) motion.current = requestAnimationFrame(frame);
    }
    motion.current = requestAnimationFrame(frame);
  }

  function choosePlace(place: Place) {
    clearHover();
    const point: Point = [place[5], place[6]];
    const zoom = place[1] === "country" || place[1] === "marine" ? 2 : 4;
    select(toCell(point[1], point[0]), false, point, "Search location", place);
    flyTo(point, zoom);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current;
    if (!start && event.pointerType === "mouse" && geo && grid) {
      clearTimeout(hoverTimer.current);
      const ticket = ++hoverTicket.current;
      const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
      const point = pointerPoint((event.clientX - left) / width, (event.clientY - top) / height, view);
      hoverTimer.current = setTimeout(() => {
        const target = toCell(point[1], point[0]);
        const slope = grid[target.row * columns + target.column];
        resolvePlace(point, geo).then(found => {
          if (ticket === hoverTicket.current) setHover({cell: target, label: placeTitle(found) + (slope === missing ? " · Insufficient data" : " · " + signed(slope / scale) + " °C/decade")});
        }).catch(() => {});
      }, 220);
    }
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
    const point = pointerPoint((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, view);
    select(toCell(point[1], point[0]), false, point, "Clicked location");
  }

  function stepCell(event: KeyboardEvent<HTMLCanvasElement>) {
    const shifts: Record<string, [number, number]> = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
    const shift = shifts[event.key];
    if (!shift) return;
    event.preventDefault();
    select({ row: clamp(cell.row + shift[0], 0, rows - 1), column: wrap(cell.column + shift[1], columns) }, true);
  }

  const geographic = place?.point === selection.point ? place.context : null;
  const searchedPlace = selection.searchedPlace;
  const unmatchedSearch = searchedPlace && searchedPlace[1] !== "marine" && geographic
    && geographic.country?.[2] !== searchedPlace[2];
  const geographicTitle = searchedPlace ? searchedPlaceLabel(searchedPlace)
    : geographic ? placeTitle(geographic)
      : geoFailed || lookupFailed ? "Geographic reference unavailable" : "Locating selected point…";
  const geographicDetail = geographic?.ambiguous ? placeDetail(geographic)
    : unmatchedSearch || (searchedPlace && lookupFailed)
      ? "Natural Earth search result. The boundary lookup could not confirm this point."
      : geographic ? placeDetail(geographic) : null;
  const clicked = textCoordinate(Number(selection.point[1].toFixed(3)), "S", "N") + " · " + textCoordinate(Number(selection.point[0].toFixed(3)), "W", "E");
  const record = detail?.row === cell.row ? detail.values[cell.column] : null;
  const [rate, , annual] = record ?? [null, null, []];
  const fits = compareWindows.map(([start, end], index) => descriptiveFit(annual, firstYear, start, end,
    index === 0 ? manifest.minimum_complete_years : Math.ceil((end - start + 1) * .8)));
  const currentFit = fits[analysisWindow];
  const validYears = annual.flatMap((value, index) => value === null ? [] : [firstYear + index]);
  const complete = validYears.length;
  const firstValid = validYears[0];
  const lastValid = validYears.at(-1);
  const chart = annual.map((value, index) => ({
    year: firstYear + index,
    temperature_c: value,
    fitted_c: currentFit.slope === null || currentFit.intercept === null
      || firstYear + index < currentFit.years[0] || firstYear + index > currentFit.years[currentFit.years.length - 1]
      ? null : currentFit.intercept + currentFit.slope * (firstYear + index - currentFit.start) / 10,
  }));

  function download() {
    if (!record) return;
    const observations = annual.map((anomaly_c, index) => ({year: firstYear + index, anomaly_c}));
    const data = {
      schema_version: manifest.schema_version, dataset: manifest.dataset, source: manifest.source,
      first_source_month: manifest.metadata.source_coverage[0], last_source_month: manifest.metadata.source_coverage[1],
      baseline: manifest.baseline, period, latitude, longitude, annual_complete_years: complete,
      valid_years: validYears,
      smoothing_km: manifest.smoothing_km, resolution_degrees: step,
      trend_method: manifest.trend_method, slope_c_per_decade: rate, intercept_c_at_period_start: record[1],
      annual_anomalies: observations,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
    const element = document.createElement("a");
    element.href = url;
    element.download = `gistemp-${latitude}-${longitude}-${firstYear}-${lastYear}.json`;
    element.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const selected = { title: searchedPlace || geographic ? geographicTitle : caption, center: caption, record };
  const sameCell = !!pin && pin.cell.row === cell.row && pin.cell.column === cell.column;
  function pinPoint(point: Point, title: string) {
    const target = toCell(point[1], point[0]);
    setPinError(false);
    setPin({ cell: target, title, center: formatCenter(target) });
  }

  function fitPair() {
    if (!pin || sameCell) return;
    clearHover();
    const firstX = manifest.first_longitude + pin.cell.column * step;
    const firstY = manifest.first_latitude - pin.cell.row * step;
    const dx = wrap(longitude - firstX + 180, 360) - 180;
    const dy = latitude - firstY;
    const zoom = clamp(Math.min(360 / (Math.abs(dx) + 16), 180 / (Math.abs(dy) + 16)), 1, 12);
    flyTo([firstX + dx / 2, firstY + dy / 2], zoom);
  }

  function loadExample(pair: "karachi" | "americas") {
    const names = pair === "karachi" ? ["Karachi", "Istanbul"] : ["New York City", "São Paulo"];
    const cities = names.map(name => geo?.places.find(p => (p[1] === "city" || p[1] === "capital") && p[0] === name));
    const [a, b] = cities;
    if (!a || !b) return;
    pinPoint([a[5], a[6]], searchedPlaceLabel(a));
    choosePlace(b);
  }

  const shownPeriod = showMap ? firstYear + "–" + lastYear : currentFit.start + "–" + currentFit.end;
  useEffect(() => { exportCell.current = download; });
  useEffect(() => {
    if ((showMap || lab) && updateSummary) updateSummary("gistemp", {
      location: selected.title, period: shownPeriod, exportAction: showMap && record ? () => exportCell.current() : undefined,
    });
  }, [lab, record, selected.title, shownPeriod, showMap, updateSummary]);

  return <div className={(route ? "workspace-world " : "") + (expanded ? "scan-layout scan-expanded" : "scan-layout")}>
    <div className="workspace-map-area" hidden={!showMap}>
    <figure ref={mapPanel} className="panel scan-map">
      <figcaption><div><h3>Global surface temperature trends</h3><p>NASA GISTEMP v4 LOTI · {firstYear}–{lastYear}</p></div><span>{manifest.valid_cells.toLocaleString("en-US")} cells with mapped slopes</span></figcaption>
      <PlaceSearch geo={geo} failed={geoFailed} choose={choosePlace} />
      <div className="scan-viewport">
        <canvas aria-label="World Scan grid. Select a cell with the pointer or move the selection with the arrow keys." tabIndex={0}
          ref={canvas} width={pixelWidth} height={pixelWidth / 2} data-zoom={view.zoom} data-map-ready={!!grid}
          data-detail-tiles={detailKey === detailedPaths?.key ? detailedPaths.tiles.length : 0}
          onKeyDown={stepCell} onPointerLeave={clearHover}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0) return;
            cancelAnimationFrame(motion.current);
            clearHover();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, origin: view, moved: false };
          }}
          onPointerMove={move} onPointerUp={event => { if (event.isPrimary && drag.current) pick(event); }}
          onLostPointerCapture={() => { drag.current = null; }} />
        {!grid && <div className="scan-message" role="status">{mapError ? "The trend grid did not load." : "Loading NASA trend grid…"}</div>}
        {hover && <span className="scan-hover" aria-hidden="true">{hover.label}</span>}
        <div className="map-buttons">
          <button type="button" disabled={view.zoom >= maxZoom} aria-label="Zoom in" onClick={() => changeZoom(view.zoom * 2)}>+</button>
          <button type="button" disabled={view.zoom <= 1} aria-label="Zoom out" onClick={() => changeZoom(view.zoom / 2)}>−</button>
          <button type="button" onClick={() => { cancelAnimationFrame(motion.current); clearHover(); setView({ x: 0, y: 0, zoom: 1 }); }}>Reset</button>
          {pin && !sameCell && <button type="button" onClick={fitPair}>Fit A + B</button>}
          <button type="button" aria-pressed={fullscreen || expanded} onClick={toggleFullscreen}>{fullscreen ? "Exit fullscreen" : expanded ? "Exit wide map" : "Fullscreen"}</button>
        </div>
      </div>
      {!geographicOnly && <div className="geo-legend scan-legend" aria-label="Trend classes in degrees Celsius per decade">
        {colors.map(color => <span key={color.label}><i style={{background: color.fill}} />{color.label}</span>)}
        <span>°C/decade</span><span><i style={{background: noData}} />Insufficient data</span>
      </div>}
      <details className="scan-coordinates"><summary>Map settings</summary>
      <div className="scan-opacity"><label>Trend opacity <input type="range" min="0" max="100" value={opacity}
        disabled={geographicOnly} onChange={event => setOpacity(Number(event.target.value))} /></label><span>{geographicOnly ? "Off" : opacity + "%"}</span></div>
      <form className="scan-coordinate-form" onSubmit={event => {
        event.preventDefault();
        const point: Point = [Number(input.longitude), Number(input.latitude)];
        select(toCell(point[1], point[0]), true, point, "Entered coordinates");
      }}>
        <label>Latitude<input type="number" min="-90" max="90" step="any" required value={input.latitude} onChange={event => setInput({ ...input, latitude: event.target.value })} /></label>
        <label>Longitude<input type="number" min="-180" max="180" step="any" required value={input.longitude} onChange={event => setInput({ ...input, longitude: event.target.value })} /></label>
        <button type="submit">Go to cell</button>
        <div className="scan-layer-options">
          <label className="scan-label-toggle"><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} /> Place labels</label>
          <label className="scan-label-toggle"><input type="checkbox" checked={!geographicOnly} onChange={event => setGeographicOnly(!event.target.checked)} /> NASA trend colors</label>
        </div>
      </form></details>
      <p className="scan-attribution">Geographic reference: Natural Earth. Climate data: NASA GISTEMP, 2° grid.</p>
      {(mapError || detailError || pinError) && <button className="scan-retry secondary-action" type="button" onClick={() => {
        setMapError(false);
        setDetailError(false);
        setPinError(false);
        setRetry(retry + 1);
      }}>Retry loading map data</button>}
    </figure>
    <aside className="panel location-card scan-cell" aria-labelledby="scan-cell-title" data-expanded={inspectorOpen}>
      {route && <button className="inspector-toggle" type="button" aria-expanded={inspectorOpen} aria-controls="inspector-extra inspector-data"
        onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? "Minimize details" : "Expand details"}</button>}
      <p className="eyebrow">{pin ? sameCell ? "Pinned place A" : "Selected place B" : "Selected place"}</p>
      <h3 id="scan-cell-title" aria-live="polite">{geographicTitle}</h3>
      {geographicDetail && <p className="scan-geographic-detail">{geographicDetail}</p>}
      <div className="scan-result" aria-live="polite">
        <strong data-testid="scan-slope">{rate === null ? "Unavailable" : signed(rate)}</strong>
        {rate !== null && <span>°C per decade</span>}
        <p>{firstYear}–{lastYear} · mapped GISTEMP grid-cell trend</p>
      </div>
      <div className="inspector-extra" id="inspector-extra">{complete > 1 && <svg className="scan-sparkline" viewBox="0 0 248 52" role="img" aria-label="Selected cell annual temperature anomaly history">
        <path d="M0 51H248" stroke="#46596a" />
        <path d={sparkline(annual)} fill="none" stroke="#6de5c5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>}
      </div><div className="scan-result-actions">
        <button className="primary-action" type="button" onClick={() => pinPoint(selection.point, selected.title)}>{pin ? "Use selection as A" : "Compare a place"}</button>
        <a className="workspace-primary" href="#scan-series">Investigate evidence ↗</a>
        {route && pin && <a className="workspace-secondary" href="#global-evidence">Open comparison ↗</a>}
      </div>
      <details id="inspector-data" className="scan-methods inspector-extra"><summary>Data &amp; methods</summary>
      <dl className="selected-meta">
        <div><dt>{selection.source}</dt><dd>{clicked}</dd></div>
        <div><dt>NASA grid-cell center</dt><dd data-testid="scan-center">{caption}</dd></div>
        {geographic?.city && !geographic.ambiguous && <div><dt>Nearby place</dt><dd>{geographic.city[0]} · {(geographic.distance ?? 0) < 1 ? "<1" : Math.round(geographic.distance ?? 0)} km</dd></div>}
        <div><dt>Dataset</dt><dd>GISTEMP v4 LOTI</dd></div>
        <div><dt>Analysis window</dt><dd>{firstYear}–{lastYear}</dd></div>
        {complete > 0 && <div><dt>Years represented</dt><dd>{firstValid}–{lastValid}</dd></div>}
        <div><dt>Complete years</dt><dd>{record ? complete + " / " + totalYears : "—"}</dd></div>
      </dl>
      <p className="scan-cell-status" role="status">{record ? rate === null ? `A slope requires at least ${manifest.minimum_complete_years} complete years.` : "OLS fit on complete calendar years." : detailError ? "Cell details did not load." : "Loading cell history…"}</p>
      <button className="secondary-action" type="button" disabled={!record} onClick={download}>Download {firstYear}–{lastYear} cell data ↓</button>
      </details>
    </aside>
    </div>
    {lab && <div className="workspace-lab-context panel">
      <div><p className="eyebrow">NASA GISTEMP · Surface temperature anomalies</p><h2>{selected.title}</h2><p>{caption} · {step}° grid · {manifest.baseline.join("–")} anomaly baseline</p></div>
      {route.view !== "comparison" && <label>Analysis period<select value={analysisWindow} onChange={event => setAnalysisWindow(Number(event.target.value))}>
        {fits.map((fit, index) => <option key={fit.start+"-"+fit.end} value={index}>{fit.start}–{fit.end}</option>)}
      </select></label>}
      <a href="#explore/gistemp" className="workspace-secondary">Change place</a>
    </div>}
    {(!route || (lab && (route.view === "sensitivity" || route.view === "verdict"))) && <GlobalStress name={selected.title} coordinates={{ latitude, longitude }} point={selection.point}
      fit={currentFit} fits={fits} active={analysisWindow} setActive={setAnalysisWindow} annual={annual}
      available={!!record} failed={detailError} checks={windowChecks} setChecks={setWindowChecks} view={route ? route.view === "verdict" ? "verdict" : "sensitivity" : undefined} />}
    <GlobalEvidence visible={showComparison} first={pin && { title: pin.title, center: pin.center, record: pinDetail?.pin === pin ? pinDetail.record : null }}
      second={selected} sameCell={sameCell} waiting={!!pin && !sameCell && !pinError && !detailError && (!record || pinDetail?.pin !== pin)}
      error={!!pin && (pinError || detailError)} ready={!!geo}
      windowIndex={analysisWindow} setWindowIndex={setAnalysisWindow}
      chooseFirst={() => pinPoint(selection.point, selected.title)} clear={() => { setPin(null); setPinDetail(null); setPinError(false); }} examples={loadExample} />
    {showChart && <div className="workspace-trend-grid"><figure id="scan-series" className="panel chart-panel scan-series">
      <figcaption className="panel-title"><div><p className="eyebrow muted">GISTEMP v4 LOTI · {caption}</p><h3>Annual surface temperature anomalies</h3></div><span className="unit-label">°C</span></figcaption>
      <p>Relative to NASA’s {manifest.baseline.join("–")} baseline. Each annual anomaly requires 12 valid months weighted by calendar days.</p>
      {complete > 0 ? <TemperatureChart points={chart} window={currentFit} anomaly /> : <p className="scan-no-series">{record ? "This cell has no complete calendar years in the analysis period." : "Annual series pending."}</p>}
      {complete > 0 && <div className="legend"><span><i className="legend-line" />Annual anomaly</span>{currentFit.slope !== null && <span><i className="legend-line legend-fit" />{currentFit.start}–{currentFit.end} fit</span>}</div>}
    </figure>
    {route && <aside className="panel interpretation workspace-trend-summary">
      <p className="eyebrow">Estimated temperature trend</p>
      <p className="slope">{!record ? detailError ? "Unavailable" : "Loading…" : currentFit.slope === null ? "Unavailable" : signed(currentFit.slope)}</p>
      <p>°C per decade · {shownPeriod}</p>
      {record && <p>{currentFit.years.length} complete years · {currentFit.minimum} required</p>}
      <a className="workspace-primary" href="#global-stress">Test window sensitivity ↗</a>
    </aside>}
    </div>}
    {lab && route.view === "uncertainty" && <article className="panel verdict-report">
      <p className="eyebrow">GISTEMP · Evidence limits</p><h3>Statistical strength not assessed</h3>
      <p>World Scan provides descriptive fits for smoothed 2° grid cells. The app reports no cell-level confidence interval or significance test.</p>
      <p>You can test whether the fitted direction changes across time windows.</p>
      <a className="workspace-secondary" href="#global-stress">Inspect window sensitivity ↗</a>
    </article>}
    {!route && <div className="panel source-detail scan-source">
      <h3>Source and limits</h3>
      <p>NASA Goddard Institute for Space Studies. LOTI combines land-surface air temperature with ERSSTv5 sea-surface temperature. Its 1,200 km smoothing makes neighboring 2° cells spatially dependent.</p>
      <p>Place names describe the selected point. The fitted trend applies to the full NASA grid cell. Natural Earth depicts de facto boundaries and marks disputes for context.</p>
      <p>Slopes describe linear change over the available years. The map shows descriptive estimates. Cell-level confidence intervals are omitted. Local Investigations uses NASA POWER’s separate MERRA-2-derived 2-meter air temperature series.</p>
      <div className="source-links"><a href="https://data.giss.nasa.gov/gistemp/data_v4.html">NASA GISTEMP documentation ↗</a><a href={manifest.source.url}>Original NetCDF archive ↗</a></div>
    </div>}
  </div>;
}
