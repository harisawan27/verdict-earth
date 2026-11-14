"""Import original Giovanni CSV exports and compare matched complete years."""

import argparse
import csv
import hashlib
import io
import math
import re
from datetime import date
from pathlib import Path

import pandas as pd

from .analysis import MIN_YEARS, annual_means, fit_trend
from .generate import ROOT
from .power import END_YEAR, START_YEAR, atomic_write, json_bytes, load_monthly

PRODUCT = "M2TMNXSLV v5.12.4"
VARIABLE = "M2TMNXSLV_5_12_4_T2M"
BOUNDS = [66.81, 24.94, 66.94, 25.06]
QUERY = (
    "https://giovanni.gsfc.nasa.gov/giovanni/#service=ArAvTs"
    "&starttime=1981-01-01T00:00:00Z&endtime=2025-12-31T23:59:59Z"
    f"&bbox={','.join(map(str, BOUNDS))}&data={VARIABLE}"
)
OUTPUT = ROOT / "data" / "results" / "giovanni-karachi.v1.json"
ARCHIVE = ROOT / "data" / "raw"
FILL = {"", "na", "nan", "null", "missing", "--", "-999", "-9999"}


def parse_export(raw: bytes, units: str) -> dict:
    """Accept the Giovanni Gregorian monthly data rows after its CSV metadata."""
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    values = {}
    header = None
    metadata = []
    for row in rows:
        if not row or not any(cell.strip() for cell in row):
            continue
        key = row[0].strip()
        if re.match(r"^\d{4}-\d{2}(?:$|-\d{2}(?:$|[ T]))", key):
            if header is None or len(row) != 2:
                raise ValueError("Expected two columns (time and T2M) after a CSV header.")
            try:
                if len(key) > 7:
                    date.fromisoformat(key[:10])
                month = pd.Period(key[:7], freq="M")
            except ValueError as error:
                raise ValueError(f"Invalid Giovanni month: {key}") from error
            if not START_YEAR <= month.year <= END_YEAR or month in values:
                raise ValueError(f"Unexpected or duplicate Giovanni month: {month}")
            fraction = row[1].strip()
            numeric = None if fraction.casefold() in FILL else float(fraction)
            if numeric is not None:
                if not math.isfinite(numeric):
                    raise ValueError(f"Non-finite Giovanni T2M at {month}")
                if abs(numeric) >= 1e10:
                    numeric = None
                else:
                    numeric -= 273.15 if units == "K" else 0
                    if not -100 <= numeric <= 70:
                        raise ValueError(f"T2M value or units are invalid at {month}")
            values[month] = numeric
        elif values:
            raise ValueError(f"Unexpected trailing CSV content: {key[:60]}")
        else:
            metadata.append(",".join(row))
            if len(row) == 2 and re.match(r"^(time|date)(\b|_)", key, re.I):
                header = row
    if not values:
        raise ValueError("CSV does not contain Giovanni monthly time-series data.")
    if not re.search(r"M2TMNXSLV[_ ](?:v?5[._]12[._]4)", "\n".join(metadata), re.I):
        raise ValueError("CSV header must identify Giovanni MERRA-2 M2TMNXSLV v5.12.4.")
    if not re.search(r"\bT2M\b|_T2M\b|2[- ]met(?:er|re) air temperature", "\n".join(metadata), re.I):
        raise ValueError("CSV header must identify the T2M variable.")
    if units == "K" and re.search(r"\(\s*(?:°C|C|Celsius)\s*\)", header[1], re.I):
        raise ValueError("The requested units conflict with the Giovanni CSV header.")
    if units == "C" and re.search(r"\(\s*(?:K|Kelvin)\s*\)", header[1], re.I):
        raise ValueError("The requested units conflict with the Giovanni CSV header.")
    return values


def build_comparison(months: dict, power: pd.Series, provenance: dict) -> dict:
    index = pd.period_range(f"{START_YEAR}-01", f"{END_YEAR}-12", freq="M")
    giovanni = pd.Series(months, dtype=float).reindex(index)
    annual = annual_means(giovanni)
    reference = annual_means(power)
    shared = annual.index.intersection(reference.index)
    if len(shared) < MIN_YEARS:
        raise ValueError(f"Need at least {MIN_YEARS} common complete years; found {len(shared)}.")
    annual = annual.loc[shared]
    reference = reference.loc[shared]
    return {
        "schema_version": 1,
        "status": "incorporated",
        "source": "NASA GES DISC Giovanni",
        "dataset": PRODUCT,
        "variable": "2-meter air temperature (T2M)",
        "units": "°C",
        "bounds_wsen": BOUNDS,
        "nominal_grid_center": {"latitude": 25.0, "longitude": 66.875},
        "source_url": QUERY,
        "product_doi": "https://doi.org/10.5067/AP1B0BA5PD2K",
        "method": "Giovanni Area-Averaged Time Series with a tight box around the POWER native cell.",
        "valid_months": int(giovanni.count()),
        "monthly_coverage": {"start": str(min(months)), "end": str(max(months))},
        "shared_complete_years": [int(year) for year in shared],
        "annual_comparison": [
            {"year": int(year), "giovanni_c": float(annual.loc[year]), "power_c": float(reference.loc[year])}
            for year in shared
        ],
        "giovanni_trend": fit_trend(annual),
        "power_trend": fit_trend(reference),
        "provenance": provenance,
        "limitations": (
            "Cross-product consistency check within MERRA-2. Differences can reflect monthly "
            "aggregation, spatial sampling, time conventions, rounding and processing."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="+", type=Path, help="Unedited CSV download(s) from classic Giovanni")
    parser.add_argument("--retrieved-date", required=True, type=date.fromisoformat, help="Actual download date in UTC")
    parser.add_argument("--units", choices=["K", "C"], default="K", help="Temperature units reported by the export")
    args = parser.parse_args()
    try:
        originals = []
        values = {}
        for source in args.csv:
            raw = source.read_bytes()
            data = parse_export(raw, args.units)
            if values.keys() & data.keys():
                raise ValueError("Giovanni CSV time ranges overlap.")
            values.update(data)
            checksum = hashlib.sha256(raw).hexdigest()
            name = f"giovanni-karachi-{min(data)}--{max(data)}-{checksum[:12]}.csv"
            originals.append((name, raw, checksum))
        power, provenance, _ = load_monthly(ARCHIVE)
        comparison = build_comparison(values, power, {
            "source_url": QUERY,
            "retrieval_date_utc": args.retrieved_date.isoformat(),
            "retrieval_method": "Manual export from the classic NASA Giovanni interface.",
            "original_units": args.units,
            "files": [
                {"path": f"data/raw/{name}", "sha256": checksum}
                for name, _, checksum in originals
            ],
            "power_source_url": provenance["source_url"],
            "power_sha256": provenance["sha256"],
        })
        for name, raw, _ in originals:
            atomic_write(ARCHIVE / name, raw)
        atomic_write(OUTPUT, json_bytes(comparison))
    except (OSError, UnicodeError, ValueError, csv.Error) as error:
        parser.exit(1, f"Giovanni import failed: {error}\n")
    print(f"Compared {len(comparison['shared_complete_years'])} shared complete years.")


if __name__ == "__main__":
    main()
