"""Build compact offline Natural Earth geography for World Scan."""

import argparse
import hashlib
import json
import urllib.request
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import shapefile
from shapely import make_valid, union_all
from shapely.geometry import Point, box, shape

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://naturalearth.s3.amazonaws.com/"
LAYERS = {
    "detailLand": "10m_physical/ne_10m_land.zip",
    "detailCoast": "10m_physical/ne_10m_coastline.zip",
    "lakes": "10m_physical/ne_10m_lakes.zip",
    "rivers": "10m_physical/ne_10m_rivers_lake_centerlines.zip",
    "coast": "50m_physical/ne_50m_coastline.zip",
    "coastal": "10m_cultural/ne_10m_admin_0_countries.zip",
    "countries": "50m_cultural/ne_50m_admin_0_countries.zip",
    "borders": "50m_cultural/ne_50m_admin_0_boundary_lines_land.zip",
    "cities": "50m_cultural/ne_50m_populated_places.zip",
    "marine": "50m_physical/ne_50m_geography_marine_polys.zip",
    "regions": "50m_cultural/ne_50m_admin_1_states_provinces.zip",
    "detailRegions": "10m_cultural/ne_10m_admin_1_states_provinces.zip",
    "regionLines": "50m_cultural/ne_50m_admin_1_states_provinces_lines.zip",
    "disputed": "50m_cultural/ne_50m_admin_0_boundary_lines_disputed_areas.zip",
    "claims": "50m_cultural/ne_50m_admin_0_breakaway_disputed_areas.zip",
}
DETAIL_COUNTRIES = {"PAK", "JPN", "GBR", "NZL", "FRA", "DEU", "MEX", "ESP"}
TILE = 15
DETAIL_TILE = 30


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def read_layers(cache):
    datasets, sources = {}, {}
    for key, name in LAYERS.items():
        path = cache / f"{key}.zip"
        if not path.exists():
            with urllib.request.urlopen(BASE + name, timeout=90) as response:
                path.write_bytes(response.read())
        data = path.read_bytes()
        with ZipFile(BytesIO(data)) as archive:
            projection = next(n for n in archive.namelist() if n.endswith(".prj"))
            version = next(n for n in archive.namelist() if n.endswith("VERSION.txt"))
            if b"WGS_1984" not in archive.read(projection):
                raise ValueError(f"Unexpected CRS for {name}")
            sources[key] = {"url": BASE + name, "sha256": hashlib.sha256(data).hexdigest(),
                            "version": archive.read(version).decode().strip(), "crs": "WGS 84"}
        with shapefile.Reader(str(path), encoding="utf-8") as reader:
            datasets[key] = [(item.shape, {k.lower(): v for k, v in item.record.as_dict().items()})
                             for item in reader.iterShapeRecords()]
    return datasets, sources


def pieces(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for child in geometry.geoms:
            yield from pieces(child, kind)


def polygon(shape_record):
    return make_valid(shape(shape_record.__geo_interface__))


def point_for(geometry, x, y):
    if isinstance(x, (int, float)) and isinstance(y, (int, float)) and geometry.covers(Point(x, y)):
        return x, y
    p = max(pieces(geometry, "Polygon"), key=lambda item: item.area).representative_point()
    return p.x, p.y


def rounded(point, digits=4):
    return [round(x, digits) for x in point]


def path_data(parts, tolerance=0.045):
    lines = []
    for part in parts:
        line = part.simplify(tolerance)
        current = []
        for x, y in line.coords:
            if current and abs(x - current[-1][0]) > 180:
                lines.append(current)
                current = []
            current.append((x, y))
        lines.append(current)
    return "".join(
        "".join(("M" if i == 0 else "L") + f"{x + 180:.3f} {90 - y:.3f}"
                for i, (x, y) in enumerate(line))
        for line in lines if len(line) >= 2
    )


def detail_paths(data, output):
    """Clip finer vector linework to viewport-sized tiles for lazy loading."""
    from shapely.strtree import STRtree

    coast = [line.simplify(0.007) for raw, _ in data["detailCoast"]
             for line in pieces(shape(raw.__geo_interface__), "LineString")]
    lakes = [edge.simplify(0.007) for raw, fields in data["lakes"]
             if fields["scalerank"] <= 5
             for part in pieces(polygon(raw), "Polygon")
             for edge in pieces(part.boundary, "LineString")]
    rivers = [line.simplify(0.012) for raw, fields in data["rivers"]
              if fields["scalerank"] <= 5
              for line in pieces(shape(raw.__geo_interface__), "LineString")]
    groups = [(lines, STRtree(lines)) for lines in (coast, lakes, rivers)]
    land = [part.simplify(0.007, preserve_topology=True) for raw, _ in data["detailLand"]
            for part in pieces(polygon(raw), "Polygon")]
    land_index = STRtree(land)
    for row in range(6):
        for column in range(12):
            west, north = column * DETAIL_TILE - 180, 90 - row * DETAIL_TILE
            tile = box(west, north - DETAIL_TILE, west + DETAIL_TILE, north)
            paths = [
                path_data((piece for index in sorted(indexed.query(tile, predicate="intersects"))
                           for piece in pieces(lines[index].intersection(tile), "LineString")), 0)
                for lines, indexed in groups
            ]
            land_path = "".join(
                path_data([ring], 0) + "Z"
                for index in sorted(land_index.query(tile, predicate="intersects"))
                for part in pieces(land[index].intersection(tile), "Polygon")
                for ring in [part.exterior, *part.interiors]
            )
            paths.append(land_path)
            if any(paths):
                write(output / f"detail-{column}-{row}.json", paths)
            yield f"{column}-{row}", bool(any(paths))


def generate(cache, output):
    data, sources = read_layers(cache)
    output.mkdir(parents=True, exist_ok=True)
    tiles = {}
    records = []
    disputed_lines = []
    region_lines = []

    def add(name, kind, parent, context, group, xy, rank, population=0, aliases=(), label_xy=None):
        identifier = len(records)
        records.append([name, kind, parent, context, group, *rounded(xy), rank, population,
                        [alias for alias in dict.fromkeys(aliases) if alias and alias != name],
                        rounded(label_xy) if label_xy else None])
        return identifier

    def assign(identifier, geometry):
        for part in pieces(geometry.simplify(0.002, preserve_topology=True), "Polygon"):
            left, bottom, right, top = part.bounds
            for y in range(max(0, int((90 - top) // TILE)), min(11, int((90 - bottom) // TILE)) + 1):
                for x in range(max(0, int((left + 180) // TILE)), min(23, int((right + 180) // TILE)) + 1):
                    west, north = x * TILE - 180, 90 - y * TILE
                    clipped = part.intersection(box(west, north - TILE, west + TILE, north))
                    for geom in pieces(clipped, "Polygon"):
                        rings = [[rounded(point) for point in ring.coords]
                                 for ring in [geom.exterior, *geom.interiors]]
                        tiles.setdefault((x, y), []).append([identifier, rings])

    coastal = {fields["adm0_a3"]: polygon(raw) for raw, fields in data["coastal"]
               if fields["adm0_a3"] in {"USA", "FJI", "TUR"}}
    coast_windows = {
        "USA": box(-75, 39.5, -72, 42),
        "FJI": box(176, -21, 180, -15),
        "TUR": box(28.7, 40.8, 29.3, 41.3),
    }
    for raw, fields in data["countries"]:
        area = polygon(raw)
        name = fields["admin"]
        code = fields["adm0_a3"]
        if code in coast_windows:
            window = coast_windows[code]
            area = union_all([area.difference(window), coastal[code].intersection(window)])
        country = add(name, "country", code, fields["continent"], fields["subregion"],
                      point_for(area, fields["label_x"], fields["label_y"]), fields["labelrank"],
                      int(fields["pop_est"]), (fields["name"], fields["name_en"], fields["iso_a3"],
                                                 fields["iso_a2"], fields["formal_en"], "UK" if code == "GBR" else ""),
                      (fields["label_x"], fields["label_y"]))
        assign(country, area)

    for raw, fields in data["regions"] + [
        (raw, fields) for raw, fields in data["detailRegions"] if fields["adm0_a3"] in DETAIL_COUNTRIES
    ]:
        code = fields["adm0_a3"]
        area = polygon(raw)
        name = fields["name_en"] or fields["name"]
        if not name:
            continue
        region = add(name, "region", code, fields["admin"], fields["type_en"],
                     point_for(area, fields["longitude"], fields["latitude"]), fields["labelrank"],
                     aliases=(fields["name"],))
        assign(region, area)
        if code in DETAIL_COUNTRIES:
            region_lines.extend(p.exterior for p in pieces(area, "Polygon"))

    for raw, fields in data["cities"]:
        name = fields["name_en"] or fields["name"]
        if not name:
            continue
        add(name, "capital" if fields["adm0cap"] else "city", fields["adm0_a3"],
            fields["adm0name"], fields["adm1name"], raw.points[0],
            fields["labelrank"], fields["pop_max"],
            (fields["name"], fields["nameascii"], fields["namealt"]))

    for raw, fields in data["marine"]:
        area = polygon(raw)
        name = fields["name"].title() if fields["name"].isupper() else fields["name"]
        feature = add(name, "marine", "", fields["featurecla"], "", point_for(area, None, None),
                      fields["scalerank"], aliases=(fields["name_en"], fields["namealt"]))
        assign(feature, area)

    for raw, fields in data["claims"]:
        area = polygon(raw)
        name = fields["name_en"] or fields["brk_name"]
        feature = add(name, "disputed", "", "", "", point_for(area, None, None), 4)
        assign(feature, area)

    international = []
    for raw, fields in data["borders"] + data["disputed"]:
        target = international if fields["featurecla"].startswith("International") else disputed_lines
        target.extend(pieces(shape(raw.__geo_interface__), "LineString"))
    for raw, _ in data["regionLines"]:
        region_lines.extend(pieces(shape(raw.__geo_interface__), "LineString"))

    write(output / "places.json", records)
    coastlines = [line for raw, _ in data["coast"] for line in pieces(shape(raw.__geo_interface__), "LineString")]
    write(output / "boundaries.json", [path_data(international), path_data(disputed_lines), path_data(coastlines)])
    write(output / "region-lines.json", path_data(region_lines))
    for (x, y), entries in sorted(tiles.items()):
        write(output / f"tile-{x}-{y}.json", entries)
    detail_keys = [key for key, available in detail_paths(data, output) if available]
    write(output / "manifest.json", {"schema": 1, "tile_degrees": TILE, "detail_keys": detail_keys, "tile_keys": sorted(
        f"{x}-{y}" for x, y in tiles), "crs": "WGS 84", "attribution": "Natural Earth",
        "license": "Public domain", "sources": sources,
        "counts": {kind: sum(row[1] == kind for row in records) for kind in sorted({row[1] for row in records})}})
    print(f"{len(records)} gazetteer records, {len(tiles)} lookup tiles, {len(detail_keys)} detail tiles")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "incoming" / "natural-earth")
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "world-scan" / "geo-v1")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    generate(args.cache, args.output)
