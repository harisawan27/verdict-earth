"""Generate the versioned JSON consumed by the Next.js build."""

import argparse
import sys
from pathlib import Path
from urllib.error import URLError

import pandas as pd

from .analysis import annual_means, fit_trend
from .power import END_YEAR, LATITUDE, LONGITUDE, REQUEST_URL, START_YEAR
from .power import atomic_write, json_bytes, load_monthly

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "results" / "karachi-t2m.v1.json"


def build_result(
    monthly: pd.Series, provenance: dict, coverage: dict, *,
    city: str = "Karachi", latitude: float = LATITUDE, longitude: float = LONGITUDE,
) -> dict:
    annual = annual_means(monthly)
    fit = fit_trend(annual)
    valid_years = set(annual.index)
    return {
        "schema_version": 1,
        "location": {"city": city, "country": "Pakistan",
                     "latitude": latitude, "longitude": longitude},
        "dataset": {
            "name": "NASA POWER Monthly and Annual · MERRA-2",
            "variable": "T2M",
            "description": "2-meter air temperature",
            "units": "°C",
            "data_type": "Gridded atmospheric reanalysis",
        },
        "requested_years": {"start": START_YEAR, "end": END_YEAR},
        "years_analyzed": {"start": int(annual.index[0]), "end": int(annual.index[-1])},
        "valid_annual_observations": len(annual),
        "annual_series": [
            {"year": year, "temperature_c": float(annual[year]) if year in valid_years else None}
            for year in range(START_YEAR, END_YEAR + 1)
        ],
        "trend": fit,
        "completeness": {
            **coverage,
            "complete_calendar_years": len(annual),
            "excluded_calendar_years": [
                year for year in range(START_YEAR, END_YEAR + 1) if year not in valid_years
            ],
        },
        "provenance": provenance,
        "limitations": [
            "NASA POWER T2M is a MERRA-2 gridded reanalysis estimate. The grid footprint can blend land and sea near Karachi and can miss neighborhood-scale conditions.",
            "A linear fit summarizes this time window. It can miss changes in the warming rate, extremes, and seasonal patterns.",
            "Conventional inference assumes independent, constant-variance residuals and uses a Student t reference. HAC allows heteroskedasticity and short-range dependence, and its interval is approximate and sensitive to lag choice.",
            "Both intervals describe slope uncertainty under the regression assumptions. They exclude uncertainty in the reanalysis itself and cannot attribute the change to a specific cause.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Download a fresh NASA response")
    args = parser.parse_args()
    try:
        monthly, provenance, coverage = load_monthly(ROOT / "data" / "raw", args.refresh)
        result = build_result(monthly, provenance, coverage)
        atomic_write(OUTPUT, json_bytes(result))
    except (OSError, URLError, ValueError, KeyError, TypeError, AttributeError) as error:
        parser.exit(1, f"NASA POWER investigation failed: {error}\nSource: {REQUEST_URL}\n")
    print(f"Verified {coverage['valid_months']}/{coverage['requested_months']} monthly values "
          f"and {result['valid_annual_observations']} complete years.")
    print(f"Generated {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
