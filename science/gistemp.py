"""Build the World Scan from the archived NASA GISTEMP v4 LOTI NetCDF."""

import argparse
import calendar
import csv
import gzip
import hashlib
import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "gistemp"
OUTPUT = ROOT / "public" / "world-scan" / "v1"
ARCHIVE = "gistemp1200_GHCNv4_ERSSTv5.nc.gz"
GLOBAL_CSV = "GLB.Ts+dSST.csv"
YEARS = np.arange(1981, 2026)
MIN_YEARS = 40
SCALE = 10_000  # Map slopes are signed 16-bit integers in 0.0001 °C/decade.
MISSING = -32768


def validate_snapshot(path, receipt):
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != receipt["sha256"] or path.stat().st_size != receipt["bytes"]:
        raise ValueError(f"NASA snapshot verification failed: {path.name}")


def canonical_grid(data):
    """Sort north to south and wrap longitudes onto the [-180, 180) axis."""
    lon = (data.lon.values + 180) % 360 - 180
    data = data.assign_coords(lon=lon).sortby("lon").sortby("lat", ascending=False)
    if (not np.array_equal(data.lat.values, np.arange(89, -90, -2))
            or not np.array_equal(data.lon.values, np.arange(-179, 180, 2))):
        raise ValueError("Expected a unique 2° global grid centered on odd degrees.")
    return data.transpose("time", "lat", "lon")


def selected_months(data, years):
    selected = data.sel(time=slice(f"{years[0]}-01-01", f"{years[-1]}-12-31"))
    dates = selected.indexes["time"]
    if [(int(y), int(m)) for y, m in zip(dates.year, dates.month)] != [
        (int(y), m) for y in years for m in range(1, 13)
    ]:
        raise ValueError("The NASA time axis is missing or duplicating a requested month.")
    return selected


def annual_means(monthly, years):
    """Require all 12 months and weight them by Gregorian month length."""
    annual = []
    for year, values in zip(years, monthly.reshape(len(years), 12, *monthly.shape[1:]), strict=True):
        days = [calendar.monthrange(int(year), month)[1] for month in range(1, 13)]
        annual.append(np.average(values, axis=0, weights=days))
    return np.stack(annual)


def trend(annual, years, minimum=MIN_YEARS):
    """OLS on actual elapsed calendar decades, allowing gaps in eligible years."""
    time = ((years - years[0]) / 10).reshape((-1,) + (1,) * (annual.ndim - 1))
    valid = np.isfinite(annual)
    count = valid.sum(axis=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        x_mean = (time * valid).sum(axis=0) / count
        y_mean = np.nansum(annual, axis=0) / count
        x_center = time - x_mean
        rate = np.nansum(x_center * (annual - y_mean), axis=0) / (x_center**2 * valid).sum(axis=0)
    rate = np.where(count >= minimum, rate, np.nan)
    return rate, y_mean - rate * x_mean, count


def map_grid(rates):
    valid = np.isfinite(rates)
    scaled = np.rint(rates[valid] * SCALE)
    if (np.abs(scaled) > 32767).any():
        raise ValueError("Grid slope is outside the artifact range.")
    grid = np.full(rates.shape, MISSING, dtype="<i2")
    grid[valid] = scaled
    return grid


def analyze(path):
    with TemporaryDirectory(prefix="verdict-gistemp-") as temp:
        nc = Path(temp) / "grid.nc"
        with gzip.open(path, "rb") as source, nc.open("wb") as dest:
            shutil.copyfileobj(source, dest)
        with xr.open_dataset(nc, engine="scipy", decode_cf=False) as raw:
            var = raw["tempanomaly"]
            history = raw.attrs["history"]
            time = raw["time"]
            time_units = time.attrs["units"]
            cal = time.attrs.get("calendar", "standard")
            fill = int(var.attrs["_FillValue"])
            packing_scale = float(var.attrs["scale_factor"])
            if (var.attrs["units"] != "K" or fill != 32767 or not np.isclose(packing_scale, 0.01)
                    or cal not in {"standard", "gregorian", "proleptic_gregorian"}
                    or not all(tag in history for tag in ("ILAND=1200", "IOCEAN=NCDC/ER5", "Base: 1951-1980"))):
                raise ValueError("Unexpected GISTEMP product metadata.")
        with xr.open_dataset(nc, engine="scipy") as dataset:
            source = dataset["tempanomaly"]
            coverage = [str(source.time.values[i])[:7] for i in (0, -1)]
            grid = canonical_grid(selected_months(source, YEARS).load())
            monthly = grid.values
            if np.isinf(monthly).any() or np.nanmax(np.abs(monthly)) > 100:
                raise ValueError("Unexpected anomaly magnitude or invalid values after decoding.")
            annual = annual_means(monthly, YEARS)
    return annual, {
        "variable": "tempanomaly", "native_units": "K", "calendar": cal,
        "time_units": time_units, "missing_value": fill, "packing_scale": packing_scale,
        "source_coverage": coverage, "netcdf_history": history,
        "valid_monthly_values": int(np.isfinite(monthly).sum()),
    }


def global_check(annual, path):
    """Compare an area-weighted diagnostic with the independently published NASA table."""
    with path.open(encoding="utf-8", newline="") as stream:
        stream.readline()
        nasa = {int(row["Year"]): row["J-D"] for row in csv.DictReader(stream) if row["Year"].isdigit()}
    official = np.array([float(nasa[year]) for year in YEARS])
    weights = np.cos(np.deg2rad(np.arange(89, -90, -2)))[:, None]
    diagnostic = np.nansum(annual * weights, axis=(1, 2)) / (
        np.isfinite(annual) * weights
    ).sum(axis=(1, 2))
    correlation = float(np.corrcoef(official, diagnostic)[0, 1])
    official_slope = float(trend(official, YEARS)[0])
    diagnostic_slope = float(trend(diagnostic, YEARS)[0])
    if correlation < 0.98 or abs(official_slope - diagnostic_slope) > 0.03:
        raise ValueError("Global diagnostic disagrees with NASA's published series.")
    return {
        "correlation": correlation, "nasa_slope_c_per_decade": official_slope,
        "diagnostic_slope_c_per_decade": diagnostic_slope,
    }


def generate(raw, out):
    receipt = json.loads((raw / "source.v1.json").read_text(encoding="utf-8"))
    validate_snapshot(raw / ARCHIVE, receipt["grid"])
    validate_snapshot(raw / GLOBAL_CSV, receipt["global_table"])
    annual, metadata = analyze(raw / ARCHIVE)
    sanity = global_check(annual, raw / GLOBAL_CSV)
    rates, intercept, count = trend(annual, YEARS)
    grid = map_grid(rates)
    out.mkdir(parents=True, exist_ok=True)
    (out / "slopes.bin").write_bytes(grid.tobytes())
    for row in range(grid.shape[0]):
        details = []
        for column in range(grid.shape[1]):
            values = annual[:, row, column]
            details.append([
                round(float(rates[row, column]), 8) if np.isfinite(rates[row, column]) else None,
                round(float(intercept[row, column]), 8) if np.isfinite(intercept[row, column]) else None,
                [round(float(value), 5) if np.isfinite(value) else None for value in values],
            ])
        (out / f"row-{row}.json").write_text(
            json.dumps(details, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8"
        )
    manifest = {
        "schema_version": 1, "dataset": "NASA GISTEMP v4 LOTI", "ocean_product": "ERSSTv5",
        "smoothing_km": 1200, "baseline": [1951, 1980], "period": [int(YEARS[0]), int(YEARS[-1])],
        "rows": 90, "columns": 180, "resolution_degrees": 2,
        "first_latitude": 89, "first_longitude": -179, "map_scale": SCALE,
        "missing": MISSING, "minimum_complete_years": MIN_YEARS,
        "valid_cells": int((grid != MISSING).sum()), "full_record_cells": int((count == len(YEARS)).sum()),
        "units": "°C/decade", "trend_method": "OLS with intercept on complete calendar years",
        "source": receipt["grid"], "global_table": receipt["global_table"],
        "metadata": metadata, "sanity_check": sanity,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    generate(args.raw, args.output)
