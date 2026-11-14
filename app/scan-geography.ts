export const geographyBase = "/world-scan/geo-v1";
export type Point = [longitude: number, latitude: number];
export type PlaceKind = "country" | "region" | "city" | "capital" | "marine" | "disputed";
export type Place = [name: string, kind: PlaceKind, code: string, context: string, group: string,
  longitude: number, latitude: number, rank: number, population: number, aliases: string[], label: Point | null];
export type Shape = [id: number, rings: Point[][]];
export type View = { x: number; y: number; zoom: number };
export type Geography = { places: Place[]; keys: Set<string>; detailKeys: Set<string>; paths: (Path2D | undefined)[] };
export type DetailTile = { column: number; row: number; paths: Path2D[] };
export const detailZoom = 8;
const detailSize = 30;
export type PlaceContext = { country?: Place; region?: Place; city?: Place; distance?: number; marine?: Place; disputed?: Place; ambiguous?: boolean };

const tiles = new Map<string, Promise<Shape[]>>();
let geography: Promise<Geography> | undefined;
const wrap = (value: number, period: number) => ((value % period) + period) % period;

async function file<T>(name: string): Promise<T> {
  const response = await fetch(geographyBase + "/" + name);
  if (!response.ok) throw new Error("Natural Earth geography is unavailable");
  return response.json();
}
export function loadGeography() {
  return geography ??= Promise.all([file<Place[]>("places.json"), file<{tile_keys: string[]; detail_keys?: string[]}>("manifest.json")])
    .then(([places, meta]) => ({ places, keys: new Set(meta.tile_keys), detailKeys: new Set(meta.detail_keys ?? []), paths: [] }))
    .catch(error => { geography = undefined; throw error; });
}
let boundaries: Promise<Path2D[]> | undefined;
let regionalLines: Promise<Path2D> | undefined;
export function loadPaths() {
  return boundaries ??= file<string[]>("boundaries.json").then(data => data.map(path => new Path2D(path)))
    .catch(error => { boundaries = undefined; throw error; });
}
export function loadRegionalLines() {
  return regionalLines ??= file<string>("region-lines.json").then(data => new Path2D(data))
    .catch(error => { regionalLines = undefined; throw error; });
}
export function visibleDetailKeys(view: View) {
  const keys = [];
  const top = Math.floor(view.y * 2 / detailSize);
  const bottom = Math.min(5, Math.ceil((view.y * 2 + 180 / view.zoom) / detailSize) - 1);
  const left = Math.floor(view.x * 2 / detailSize);
  const right = Math.ceil((view.x * 2 + 360 / view.zoom) / detailSize) - 1;
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) keys.push(wrap(column, 12) + "-" + row);
  }
  return keys;
}

const detailTiles = new Map<string, Promise<DetailTile>>();
export function loadDetailTile(key: string) {
  const stored = detailTiles.get(key);
  if (stored) return stored;
  if (detailTiles.size >= 24) detailTiles.delete(detailTiles.keys().next().value!);
  const [column, row] = key.split("-").map(Number);
  const request = file<string[]>("detail-" + key + ".json")
    .then(data => ({ column, row, paths: data.map(path => new Path2D(path)) }))
    .catch(error => { detailTiles.delete(key); throw error; });
  detailTiles.set(key, request);
  return request;
}

export function pointerPoint(x: number, y: number, view: View): Point {
  return [wrap(view.x * 2 + x * 360 / view.zoom, 360) - 180,
    Math.max(-90, Math.min(90, 90 - view.y * 2 - y * 180 / view.zoom))];
}
export function tileKey([longitude, latitude]: Point) {
  return Math.floor(wrap(longitude + 180, 360) / 15) + "-"
    + Math.max(0, Math.min(11, Math.floor((90 - latitude) / 15)));
}
function polygonContains([x, y]: Point, rings: Point[][]) {
  let inside = false;
  for (const ring of rings) {
    // Even-odd parity handles holes. Exact ring edges return an ambiguous match.
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
      if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)
          && (ax !== bx || ay !== by) && Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-9) return 2;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
  }
  return Number(inside);
}
function distanceKm([a, b]: Point, longitude: number, latitude: number) {
  const degrees = Math.PI / 180;
  const h = Math.sin((latitude - b) * degrees / 2) ** 2
    + Math.cos(b * degrees) * Math.cos(latitude * degrees) * Math.sin((longitude - a) * degrees / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function identify(point: Point, places: Place[], shapes: Shape[]): PlaceContext {
  const [longitude, latitude] = point;
  const query: Point = [wrap(longitude + 180, 360) - 180, latitude];
  const matches = new Map<number, number>();
  const boundary = (n: number, offset: number) => Math.abs((n + offset) % 15) < 1e-9;
  for (const [id, rings] of shapes) {
    const result = polygonContains(query, rings);
    if (result) matches.set(id, Math.min(matches.get(id) ?? result, result));
  }
  const hits = [...matches.keys()].map(id => places[id]);
  const countries = hits.filter(place => place[1] === "country");
  const disputed = hits.find(place => place[1] === "disputed");
  const marine = hits.filter(place => place[1] === "marine")
    .sort((left, right) => Number(left[3] === "ocean") - Number(right[3] === "ocean"))[0];
  const edge = [...matches].some(([id, result]) => places[id][1] === "country" && result === 2);
  if (disputed || countries.length > 1 || (edge && !boundary(query[0], 180) && !boundary(query[1], 90))) {
    return { disputed, ambiguous: true };
  }
  const country = countries[0];
  const region = country && hits.find(place => place[1] === "region" && place[2] === country[2]);
  let city: Place | undefined;
  let distance = country ? 65 : 12;
  for (const place of places) {
    if ((place[1] !== "city" && place[1] !== "capital") || (country && place[2] !== country[2])) continue;
    const km = distanceKm(query, place[5], place[6]);
    if (km <= distance) {
      city = place;
      distance = km;
    }
  }
  return { country, region, marine: country ? undefined : marine, city, distance: city ? distance : undefined };
}
export async function resolvePlace(point: Point, geo: Geography) {
  const key = tileKey(point);
  if (!geo.keys.has(key)) return {};
  if (!tiles.has(key)) {
    if (tiles.size >= 24) tiles.delete(tiles.keys().next().value!);
    tiles.set(key, file<Shape[]>("tile-" + key + ".json").catch(error => { tiles.delete(key); throw error; }));
  }
  return identify(point, geo.places, await tiles.get(key)!);
}
export function searchedPlaceLabel(place: Place) {
  const [name, kind, , context] = place;
  return kind === "city" || kind === "capital" || kind === "region"
    ? [name, context].filter(Boolean).join(", ") : name;
}

const normalized = (name: string) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function searchPlaces(places: Place[], query: string) {
  const term = normalized(query);
  if (!term) return [];
  return places.flatMap((place, id) => {
    if (place[1] === "disputed") return [];
    const names = [place[0], ...place[9]].map(normalized);
    const score = Math.max(...names.map(name => (name === term ? 6 : name.startsWith(term) ? 4
      : name.split(" ").some(word => word.startsWith(term)) ? 2 : 0)));
    return score ? [{ id, place, score }] : [];
  }).sort((a, b) => b.score - a.score
    || Number(b.place[1] === "country") - Number(a.place[1] === "country")
    || b.place[8] - a.place[8] || a.place[0].localeCompare(b.place[0])).slice(0, 8);
}

export function drawGeography(ctx: CanvasRenderingContext2D, geo: Geography, view: View, labelScale: number, showLabels: boolean, selectedCity: Place | undefined, detail: DetailTile[], geographicOnly: boolean) {
  const factor = ctx.canvas.width / 360 * view.zoom;
  const offsets = [-360, 0, 360];
  const activeDetail = view.zoom >= detailZoom ? detail : [];
  ctx.save();
  for (const offset of offsets) {
    ctx.save();
    ctx.translate((offset - view.x * 2) * factor, -view.y * 2 * factor);
    ctx.scale(factor, factor);
    if (geo.paths[2]) {
      ctx.save();
      const mask = new Path2D();
      mask.rect(0, 0, 360, 180);
      for (const tile of activeDetail) mask.rect(tile.column * detailSize, tile.row * detailSize, detailSize, detailSize);
      ctx.clip(mask, "evenodd");
      ctx.strokeStyle = "#263e4d";
      ctx.lineWidth = labelScale * 0.85 / factor;
      ctx.stroke(geo.paths[2]);
      ctx.restore();
    }
    for (const tile of activeDetail) {
      const [coast, lakes, rivers, land] = tile.paths;
      if (geographicOnly && land) {
        ctx.fillStyle = "#dceaf0";
        ctx.fillRect(tile.column * detailSize, tile.row * detailSize, detailSize, detailSize);
        ctx.fillStyle = "#eff1e7";
        ctx.fill(land, "evenodd");
      }
      ctx.strokeStyle = "#263e4d";
      ctx.lineWidth = labelScale * .85 / factor;
      ctx.stroke(coast);
      ctx.strokeStyle = geographicOnly ? "#6ba5c9" : "#436881";
      ctx.lineWidth = labelScale * .75 / factor;
      ctx.stroke(lakes);
      ctx.globalAlpha = .78;
      ctx.stroke(rivers);
      ctx.globalAlpha = 1;
    }
    if (view.zoom >= 4 && geo.paths[3]) {
      ctx.strokeStyle = "rgba(35,51,64,.54)";
      ctx.lineWidth = labelScale * 0.7 / factor;
      ctx.stroke(geo.paths[3]);
    }
    if (geo.paths[0]) {
      ctx.strokeStyle = "rgba(20,38,50,.82)";
      ctx.lineWidth = labelScale * 1.05 / factor;
      ctx.stroke(geo.paths[0]);
      ctx.setLineDash([3 * labelScale / factor, 2 * labelScale / factor]);
      ctx.strokeStyle = "rgba(100,46,77,.83)";
      if (geo.paths[1]) ctx.stroke(geo.paths[1]);
    }
    ctx.restore();
  }
  if (showLabels) {
    const visible: { place: Place; x: number; y: number; priority: number }[] = [];
    for (const place of geo.places) {
      const [, kind, , category, , longitude, latitude, rank, population, , anchor] = place;
      const selected = place === selectedCity;
      if (!selected && (kind === "disputed" || (kind === "region" && view.zoom < 4)
          || (kind === "country" && rank > (view.zoom === 1 ? 2 : view.zoom < 4 ? 4 : 9))
          || (kind === "city" && population < (view.zoom === 1 ? Infinity : view.zoom < 4 ? 1200000 : view.zoom < 8 ? 270000 : view.zoom < 16 ? 50000 : 0))
          || (kind === "capital" && population < (view.zoom === 1 ? 1400000 : view.zoom < 4 ? 300000 : 0))
          || (kind === "marine" && category !== "ocean" && (view.zoom < 4 || rank > 3)))) continue;
      const [lon, lat] = anchor ?? [longitude, latitude];
      const y = (90 - lat - view.y * 2) * factor;
      if (y < 10 * labelScale || y > ctx.canvas.height - 17 * labelScale) continue;
      for (const offset of offsets) {
        const x = (lon + 180 + offset - view.x * 2) * factor;
        if (x < 0 || x > ctx.canvas.width) continue;
        const priority = selected ? 110 : kind === "country" ? 100 - rank : kind === "marine" ? 60 - rank
          : kind === "region" ? 30 - rank : kind === "capital" ? 55 - rank : 45 - rank;
        visible.push({ place, x, y, priority });
      }
    }
    visible.sort((a, b) => b.priority - a.priority || b.place[8] - a.place[8]);
    const occupied: [number, number, number, number][] = [];
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const { place, x, y } of visible) {
      const [name, kind] = place;
      const dot = kind === "city" || kind === "capital";
      const size = labelScale * (kind === "country" ? 12 : 11);
      ctx.font = (kind === "country" ? "700 " : kind === "marine" ? "italic 600 " : "600 ") + size + "px system-ui";
      const width = ctx.measureText(name).width;
      const left = dot ? (x + width + 9 * labelScale > ctx.canvas.width ? x - width - 5 * labelScale : x + 5 * labelScale) : x - width / 2;
      const box: [number, number, number, number] = [Math.min(left - 3 * labelScale, dot ? x - 4 * labelScale : left), y - size * .72, Math.max(left + width + 4 * labelScale, dot ? x + 4 * labelScale : left), y + size * .72];
      if (box[0] < 0 || box[2] > ctx.canvas.width
          || occupied.some(other => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) continue;
      occupied.push(box);
      ctx.strokeStyle = "rgba(9,24,35,.89)";
      ctx.fillStyle = kind === "marine" ? "#dcefff" : "#f8f6ee";
      ctx.lineWidth = 2.6 * labelScale;
      if (dot) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8 * labelScale, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fill();
      }
      ctx.strokeText(name, left, y);
      ctx.fillText(name, left, y);
    }
  }
  ctx.restore();
}
