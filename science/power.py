"""Fetch and validate the fixed NASA POWER investigation input."""

import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd

START_YEAR, END_YEAR = 1981, 2025
LATITUDE, LONGITUDE = 24.9, 67.0
REQUEST_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point?" + urlencode(
    {
        "parameters": "T2M",
        "community": "SB",
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "start": START_YEAR,
        "end": END_YEAR,
        "format": "JSON",
    }
)
DOCS_URL = "https://power.larc.nasa.gov/docs/services/api/temporal/monthly/"
SOURCE_DOCS_URL = "https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/"
CACHE_STEM = f"nasa-power-karachi-t2m-{START_YEAR}-{END_YEAR}"


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary_path = Path(stream.name)
        try:
            stream.write(content)
            stream.close()
            temporary_path.replace(path)
        finally:
            temporary_path.unlink(missing_ok=True)


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def unique_object(items: list[tuple]) -> dict:
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError(f"Duplicate NASA JSON key: {key}")
        result[key] = value
    return result


def parse_nasa_date(value: str) -> date:
    if not re.fullmatch(r"[0-9]{8}", value):
        raise ValueError(f"Invalid NASA coverage date: {value!r}")
    return datetime.strptime(value, "%Y%m%d").date()


def validate_response(body: bytes, receipt: dict) -> tuple[pd.Series, dict, dict]:
    """Return a complete requested monthly index, provenance, and coverage counts."""
    digest = hashlib.sha256(body).hexdigest()
    if receipt["sha256"] != digest or receipt["source_url"] != REQUEST_URL:
        raise ValueError("Cached payload does not match its SHA-256 or the configured NASA request.")
    retrieved = datetime.fromisoformat(receipt["retrieved_at_utc"])
    if retrieved.tzinfo is None or retrieved.utcoffset().total_seconds() != 0:
        raise ValueError("NASA retrieval timestamp must be UTC.")

    payload = json.loads(body, object_pairs_hook=unique_object)
    header = payload["header"]
    geometry = payload["geometry"]
    response_coords = geometry["coordinates"]
    if (
        payload["type"] != "Feature"
        or geometry["type"] != "Point"
        or response_coords[:2] != [LONGITUDE, LATITUDE]
    ):
        raise ValueError(f"Unexpected NASA point coordinates: {response_coords!r}")
    api = header["api"]
    if not all(isinstance(api[key], str) and api[key] for key in ("name", "version")):
        raise ValueError("NASA response has invalid API metadata.")
    if not isinstance(header["sources"], list) or header["sources"] != ["MERRA2"]:
        raise ValueError(f"Unexpected NASA source: {header['sources']!r}")
    metadata = payload["parameters"]["T2M"]
    if metadata["units"] != "C" or not isinstance(metadata["longname"], str):
        raise ValueError(f"Unexpected NASA T2M parameter metadata: {metadata!r}")
    fill = header["fill_value"]
    if type(fill) not in (int, float) or not math.isfinite(fill):
        raise ValueError("NASA fill value is missing or invalid.")

    first_day = parse_nasa_date(header["start"])
    last_day = parse_nasa_date(header["end"])
    if not date(START_YEAR, 1, 1) <= first_day <= last_day <= date(END_YEAR, 12, 31):
        raise ValueError("NASA coverage metadata is outside the requested range.")

    index = pd.period_range(f"{START_YEAR}-01", f"{END_YEAR}-12", freq="M")
    values = {}
    fill_months = []
    partial_months = []
    annual_summaries = 0
    observations = payload["properties"]["parameter"]["T2M"]
    if not isinstance(observations, dict) or not observations:
        raise ValueError("NASA response has no T2M observations.")

    for key, value in observations.items():
        if not re.fullmatch(r"[0-9]{6}", key):
            raise ValueError(f"Unexpected NASA observation key: {key!r}")
        year, month = int(key[:4]), int(key[4:])
        if not START_YEAR <= year <= END_YEAR or not 1 <= month <= 13:
            raise ValueError(f"Unexpected NASA year or month: {key}")
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError(f"Invalid NASA T2M value for {key}: {value!r}")
        if month == 13:
            annual_summaries += 1
            continue

        period = pd.Period(year=year, month=month, freq="M")
        begin, end = period.start_time.date(), period.end_time.date()
        if end < first_day or begin > last_day:
            raise ValueError(f"NASA month {period} is outside its reported coverage.")
        if value == fill:
            fill_months.append(str(period))
        if begin < first_day or end > last_day:
            partial_months.append(str(period))
        values[period] = (
            None if value == fill or begin < first_day or end > last_day else value
        )

    series = pd.Series(values, dtype=float).reindex(index)
    provenance = {
        **receipt,
        "documentation_url": DOCS_URL,
        "source_documentation_url": SOURCE_DOCS_URL,
        "attribution": "NASA Langley Research Center POWER Project, using NASA GMAO MERRA-2.",
        "community": "SB",
        "header": header,
        "parameter": metadata,
        "returned_coordinates": response_coords,
        "messages": payload["messages"],
    }
    coverage = {
        "requested_months": len(index),
        "returned_month_keys": len(values),
        "valid_months": int(series.count()),
        "absent_months": [str(period) for period in index if period not in values],
        "fill_value_months": sorted(fill_months),
        "partial_months": sorted(partial_months),
        "ignored_annual_summaries": annual_summaries,
    }
    return series, provenance, coverage


def load_monthly(cache: Path, refresh: bool = False) -> tuple[pd.Series, dict, dict]:
    body_path = cache / f"{CACHE_STEM}.json"
    receipt_path = cache / f"{CACHE_STEM}.source.json"
    if not refresh and body_path.exists() and receipt_path.exists():
        return validate_response(body_path.read_bytes(), json.loads(receipt_path.read_bytes()))
    if not refresh and (body_path.exists() or receipt_path.exists()):
        raise ValueError("NASA cache is incomplete. Use --refresh to recreate both files.")

    request = Request(REQUEST_URL, headers={"User-Agent": "VerdictEarth/0.1"})
    try:
        with urlopen(request, timeout=45) as response:
            body = response.read()
    except HTTPError as error:
        detail = error.read(1500).decode("utf-8", errors="replace")
        raise ValueError(f"NASA POWER HTTP {error.code}: {detail}") from error
    receipt = {
        "source_url": REQUEST_URL,
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    validated = validate_response(body, receipt)
    atomic_write(body_path, body)
    atomic_write(receipt_path, json_bytes(receipt))
    return validated
