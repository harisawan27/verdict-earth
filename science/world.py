"""Build the worldwide temperature atlas from NASA POWER point records."""

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .analysis import annual_means
from .generate import ROOT, build_result
from .power import START_YEAR, END_YEAR, atomic_write, json_bytes, load_monthly
from .region import candidate_native_cells, detect_duplicates, window_results

BASELINE = (1991, 2020)
SITES = (
    ("new-york", "New York", "United States", "North America", 40.7143, -74.006),
    ("toronto", "Toronto", "Canada", "North America", 43.7001, -79.4163),
    ("vancouver", "Vancouver", "Canada", "North America", 49.2497, -123.1193),
    ("mexico-city", "Mexico City", "Mexico", "North America", 19.4285, -99.1277),
    ("seattle", "Seattle", "United States", "North America", 47.6062, -122.3321),
    ("bogota", "Bogotá", "Colombia", "South America", 4.6097, -74.0817),
    ("lima", "Lima", "Peru", "South America", -12.0432, -77.0282),
    ("sao-paulo", "São Paulo", "Brazil", "South America", -23.5475, -46.6361),
    ("buenos-aires", "Buenos Aires", "Argentina", "South America", -34.6132, -58.3772),
    ("santiago", "Santiago", "Chile", "South America", -33.4569, -70.6483),
    ("london", "London", "United Kingdom", "Europe", 51.5085, -0.1257),
    ("oslo", "Oslo", "Norway", "Europe", 59.9127, 10.7461),
    ("berlin", "Berlin", "Germany", "Europe", 52.5244, 13.4105),
    ("madrid", "Madrid", "Spain", "Europe", 40.4165, -3.7026),
    ("rome", "Rome", "Italy", "Europe", 41.8919, 12.5113),
    ("cairo", "Cairo", "Egypt", "Africa", 30.0626, 31.2497),
    ("lagos", "Lagos", "Nigeria", "Africa", 6.4541, 3.3947),
    ("nairobi", "Nairobi", "Kenya", "Africa", -1.2833, 36.8167),
    ("johannesburg", "Johannesburg", "South Africa", "Africa", -26.2023, 28.0436),
    ("cape-town", "Cape Town", "South Africa", "Africa", -33.9258, 18.4232),
    ("karachi", "Karachi", "Pakistan", "Asia", 24.9, 67.0),
    ("delhi", "Delhi", "India", "Asia", 28.6519, 77.2315),
    ("dubai", "Dubai", "United Arab Emirates", "Asia", 25.0657, 55.1713),
    ("bangkok", "Bangkok", "Thailand", "Asia", 13.7563, 100.5018),
    ("tokyo", "Tokyo", "Japan", "Asia", 35.6895, 139.6917),
    ("singapore", "Singapore", "Singapore", "Asia", 1.2897, 103.8501),
    ("beijing", "Beijing", "China", "Asia", 39.9075, 116.3972),
    ("sydney", "Sydney", "Australia", "Oceania", -33.8679, 151.2073),
    ("melbourne", "Melbourne", "Australia", "Oceania", -37.814, 144.9633),
    ("perth", "Perth", "Australia", "Oceania", -31.9522, 115.8614),
    ("auckland", "Auckland", "New Zealand", "Oceania", -36.8485, 174.7635),
)

OUTPUT = ROOT / "data" / "results" / "world-t2m.v1.json"
CACHE = ROOT / "data" / "raw"
REGION = ROOT / "data" / "results" / "sindh-t2m.v1.json"


def month_calendar(monthly):
    baseline = monthly.loc[str(BASELINE[0]):str(BASELINE[1])]
    groups = baseline.groupby(baseline.index.month)
    means = groups.mean().where(groups.count() == BASELINE[1] - BASELINE[0] + 1)

    def number(value):
        return None if value != value else round(float(value), 3)

    return {
        "baseline_years": list(BASELINE),
        "baseline_c": [number(means.get(month, float("nan"))) for month in range(1, 13)],
        "first_year": int(monthly.index[0].year),
        "temperature_c": [number(value) for value in monthly],
        "anomaly_c": [number(value - means.get(date.month, float("nan")))
                      for date, value in monthly.items()],
    }


def sample(site, cache, refresh, offline, verified):
    slug, city, country, continent, latitude, longitude = site
    path = cache / f"nasa-power-{slug}-t2m-{START_YEAR}-{END_YEAR}.json"
    if offline and not path.is_file():
        raise ValueError("NASA snapshot is unavailable")
    for attempt in range(3):
        try:
            monthly, provenance, coverage = load_monthly(
                cache, refresh=refresh and slug != "karachi", slug=slug,
                latitude=latitude, longitude=longitude,
            )
            break
        except (OSError, ValueError) as error:
            retryable = isinstance(error, OSError) or any(
                f"HTTP {status}" in str(error) for status in (429, 500, 502, 503, 504)
            )
            if offline or attempt == 2 or not retryable:
                raise
            time.sleep(3 * (attempt + 1))
    result = build_result(monthly, provenance, coverage, city=city,
                          latitude=latitude, longitude=longitude)
    candidates = candidate_native_cells(latitude, longitude)
    return {
        "id": slug, "country": country, "continent": continent,
        "latitude": latitude, "longitude": longitude,
        "location": {"city": city},
        "candidate_native_cells": candidates,
        "native_cell": verified.get(slug),
        "monthly_values": monthly.to_numpy(),
        "calendar": month_calendar(monthly),
        "annual_series": result["annual_series"],
        "completeness": result["completeness"],
        "provenance": provenance,
        "windows": window_results(annual_means(monthly)),
    }


def build_world(cache: Path, *, refresh=False, offline=False):
    region = json.loads(REGION.read_bytes())
    regional = {item["id"]: item for item in region["stations"]}
    verified = {slug: item["native_cell"] for slug, item in regional.items()}
    stations, failures = [], []

    def acquire(site):
        try:
            return sample(site, cache, refresh, offline, verified), None
        except (OSError, ValueError, TypeError, KeyError) as error:
            return None, {"id": site[0], "reason": str(error)[:400]}

    with ThreadPoolExecutor(max_workers=3) as pool:
        for site, failure in pool.map(acquire, SITES):
            if failure:
                failures.append(failure)
                print(failure, flush=True)
            else:
                stations.append(site)
                print(f"{site['id']}: {site['completeness']['complete_calendar_years']} complete years", flush=True)
    duplicates = detect_duplicates(stations)
    for station in stations:
        del station["monthly_values"]
        station["shared_sample_flags"] = [pair for pair in duplicates if station["id"] in pair["sites"]]
    if not stations:
        raise ValueError("No valid NASA records were available")
    return {
        "schema_version": 1, "region": "Worldwide atlas",
        "dataset": region["dataset"], "requested_years": region["requested_years"],
        "stations": stations, "duplicate_pairs": duplicates, "excluded_sites": failures,
        "grid_verification": region["grid_verification"],
        "methods": {**region["methods"], "grid_check": (
            "Karachi was matched to the NASA POWER regional response. Other atlas locations "
            "show inferred nearest native grid centers. Nominal centers and monthly record "
            "identity are screened for duplicate samples."
        )},
        "limitations": region["limitations"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--offline", action="store_true", help="Use saved NASA snapshots only")
    modes.add_argument("--refresh", action="store_true", help="Re-fetch non-Karachi snapshots")
    args = parser.parse_args()
    result = build_world(CACHE, refresh=args.refresh, offline=args.offline)
    atomic_write(OUTPUT, json_bytes(result))
    print(f"Generated {len(result['stations'])} investigations and {len(result['excluded_sites'])} exclusions")


if __name__ == "__main__":
    main()
