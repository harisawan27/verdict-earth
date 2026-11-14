"""Regenerate the Sindh investigation from verified NASA monthly snapshots."""

import argparse
import hashlib
import json
from collections import defaultdict
from itertools import combinations

import numpy as np

from .analysis import MIN_YEARS, annual_means, fit_trend
from .generate import ROOT, build_result
from .power import END_YEAR, START_YEAR, atomic_write, json_bytes, load_monthly

PMD_URL = "https://rmcsindh.pmd.gov.pk/Network.html"
SITES = (
    ("karachi", "Karachi", 24.9, 67.0),
    ("hyderabad", "Hyderabad", 25.3833, 68.4167),
    ("badin", "Badin", 24.6333, 68.9),
    ("thatta", "Thatta", 24.75, 67.9),
    ("nawabshah", "Nawabshah", 26.25, 68.3667),
    ("sukkur", "Sukkur", 27.7, 68.8667),
    ("larkana", "Larkana", 27.5333, 68.2),
    ("mithi", "Mithi", 24.75, 69.8),
)
WINDOWS = ((1981, 2025), (1991, 2025), (2001, 2025), (1981, 2015))
GRID_YEAR = 2023
GRID_STEM = f"nasa-power-sindh-grid-{GRID_YEAR}"
GRID_URL = (
    "https://power.larc.nasa.gov/api/temporal/monthly/regional?"
    "parameters=T2M&community=SB&latitude-min=24&latitude-max=28&"
    f"longitude-min=66&longitude-max=71&start={GRID_YEAR}&end={GRID_YEAR}&format=JSON"
)
OUTPUT = ROOT / "data" / "results" / "sindh-t2m.v1.json"


def window_results(annual):
    results = []
    for start, end in WINDOWS:
        selected = annual.loc[start:end]
        if len(selected) < MIN_YEARS:
            continue
        results.append({
            "id": f"{start}-{end}",
            "start": start,
            "end": end,
            "valid_years": [int(year) for year in selected.index],
            "trend": fit_trend(selected),
        })
    return results


def detect_duplicates(stations):
    """Look for series identity and points sharing a candidate native cell."""
    matches = []
    for left, right in combinations(stations, 2):
        same_cell = left.get("native_cell") is not None and left["native_cell"] == right.get("native_cell")
        shared = set(left["candidate_native_cells"]) & set(right["candidate_native_cells"])
        first = left["monthly_values"]
        second = right["monthly_values"]
        overlap = np.isfinite(first) & np.isfinite(second)
        identical = (
            int(overlap.sum()) >= 12
            and np.array_equal(first, second, equal_nan=True)
        )
        near = max(
            abs(left["latitude"] - right["latitude"]),
            abs(left["longitude"] - right["longitude"]),
        ) <= 0.001
        reasons = [
            label for label, seen in [
                ("same verified native cell", same_cell),
                ("possible shared native cell", shared and not same_cell),
                ("identical monthly series", identical),
                ("near-identical request coordinates", near),
            ] if seen
        ]
        if reasons:
            matches.append({"sites": [left["id"], right["id"]], "reasons": reasons})
    return matches


def candidate_native_cells(latitude, longitude):
    """Use nearest nominal grid centers, retaining both candidates at an exact tie."""
    def candidates(value, spacing):
        index = value / spacing
        lower = int(np.floor(index))
        if abs(index - lower - 0.5) < 1e-9:
            return [lower * spacing, (lower + 1) * spacing]
        return [int(np.floor(index + 0.5)) * spacing]

    return [
        (lat, lon) for lat in candidates(latitude, 0.5)
        for lon in candidates(longitude, 0.625)
    ]


def load_grid(cache):
    body = (cache / f"{GRID_STEM}.json").read_bytes()
    receipt = json.loads((cache / f"{GRID_STEM}.source.json").read_bytes())
    if receipt["sha256"] != hashlib.sha256(body).hexdigest() or receipt["source_url"] != GRID_URL:
        raise ValueError("NASA regional grid snapshot failed provenance validation.")
    grid = json.loads(body)
    header = grid["header"]
    if (grid["type"] != "FeatureCollection" or grid["parameters"]["T2M"]["units"] != "C"
            or header["sources"] != ["MERRA2"] or header["time_standard"] != "LST"
            or (header["start"], header["end"]) != (f"{GRID_YEAR}0101", f"{GRID_YEAR}1231")):
        raise ValueError("NASA regional grid metadata are unexpected.")
    return grid["features"], receipt, header


def match_native_cell(monthly, features, fill):
    observed = monthly.loc[str(GRID_YEAR)].to_numpy()
    if len(observed) != 12 or not np.isfinite(observed).all():
        return None
    matches = []
    for feature in features:
        values = feature["properties"]["parameter"]["T2M"]
        compared = [values.get(f"{GRID_YEAR}{month:02}") for month in range(1, 13)]
        if fill not in compared and np.array_equal(observed, compared):
            longitude, latitude, *_ = feature["geometry"]["coordinates"]
            matches.append({"latitude": latitude, "longitude": longitude})
    return matches[0] if len(matches) == 1 else None


def build_region(cache, refresh=False):
    features, grid_receipt, grid_header = load_grid(cache)
    stations = []
    for slug, city, lat, lon in SITES:
        monthly, provenance, coverage = load_monthly(
            cache, refresh=refresh and slug != "karachi",
            slug=slug, latitude=lat, longitude=lon,
        )
        base = build_result(monthly, provenance, coverage, city=city, latitude=lat, longitude=lon)
        stations.append({
            "id": slug,
            "latitude": lat,
            "longitude": lon,
            "coordinate_source": "Milestone 1 reference point" if slug == "karachi" else PMD_URL,
            "candidate_native_cells": candidate_native_cells(lat, lon),
            "native_cell": match_native_cell(monthly, features, grid_header["fill_value"]),
            "monthly_values": monthly.to_numpy(),
            "location": base["location"],
            "annual_series": base["annual_series"],
            "completeness": base["completeness"],
            "provenance": provenance,
            "windows": window_results(annual_means(monthly)),
        })

    duplicate_pairs = detect_duplicates(stations)
    for station in stations:
        station.pop("monthly_values")
    flags = defaultdict(list)
    for pair in duplicate_pairs:
        for station_id in pair["sites"]:
            flags[station_id].append(pair)
    for station in stations:
        station["shared_sample_flags"] = flags[station["id"]]

    return {
        "schema_version": 1,
        "region": "Sindh, Pakistan",
        "dataset": {
            "provider": "NASA POWER",
            "original_product": "NASA GMAO MERRA-2",
            "variable": "T2M",
            "name": "2-meter air temperature",
            "units": "°C",
            "spatial_resolution": "0.5° latitude × 0.625° longitude",
            "temporal_resolution": "Monthly inputs · calendar-year means",
            "data_type": "Gridded atmospheric reanalysis",
        },
        "requested_years": {"start": START_YEAR, "end": END_YEAR},
        "stations": stations,
        "duplicate_pairs": duplicate_pairs,
        "grid_verification": {**grid_receipt, "comparison_year": GRID_YEAR},
        "methods": {
            "annual_aggregation": "Weight each month by its calendar days. Require 12 valid months per year.",
            "regression": "Ordinary least squares with intercept, using calendar decades.",
            "conventional": "Student t inference assumes independent, constant-variance errors.",
            "hac": "Newey–West HAC uses Bartlett weights, floor(4 × (n/100)^(2/9)) calendar-year lags, and n/(n−2) covariance correction. The Student t reference is approximate.",
            "grid_check": "Identify a unique native grid cell by an exact match of all 12 calendar-month values against the NASA POWER regional 2023 response. Nominal nearest centers, record identity and request proximity provide additional duplicate screening.",
        },
        "limitations": [
            "Grid estimates can combine land and sea and can miss neighborhood-scale conditions.",
            "Locations may have spatially correlated errors, even when their series differ.",
            "A linear fit can miss changes in rate, extremes, and seasonal patterns. Shorter windows typically have less statistical power.",
            "The displayed inference is conditional on each period and method. The related windows are descriptive sensitivity checks and are not adjusted for multiple comparisons.",
            "Intervals represent regression uncertainty and exclude reanalysis uncertainty. The analysis cannot establish what caused the change.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Download fresh records for the new sites")
    args = parser.parse_args()
    try:
        result = build_region(ROOT / "data" / "raw", refresh=args.refresh)
        atomic_write(OUTPUT, json_bytes(result))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"Sindh investigation failed: {error}\n")
    for site in result["stations"]:
        full = site["windows"][0]
        print(f"{site['id']}: {len(full['valid_years'])} years, "
              f"{full['trend']['slope_c_per_decade']:+.6f} °C/decade")
    print(f"Generated {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
