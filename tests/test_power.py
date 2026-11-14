"""Controlled NASA response fixtures plus a separate regression check on the real cache."""

import hashlib
import json
from urllib.error import URLError

import pytest

from science.generate import ROOT, build_result
from science.power import REQUEST_URL, json_bytes, load_monthly, validate_response


@pytest.fixture
def synthetic_payload():
    values = {
        f"{year}{month:02}": 20.0 + 0.05 * (year - 1981) + month / 10
        for year in range(1981, 2026)
        for month in range(1, 14)
    }
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [67.0, 24.9, 50.0]},
        "header": {
            "api": {"name": "POWER Monthly and Annual API test fixture", "version": "fixture"},
            "sources": ["MERRA2"], "fill_value": -999, "time_standard": "LST",
            "start": "19810101", "end": "20251231",
        },
        "parameters": {"T2M": {"units": "C", "longname": "Temperature at 2 Meters"}},
        "properties": {"parameter": {"T2M": values}},
        "messages": [],
    }


def serialize_fixture(payload):
    body = json_bytes(payload)
    receipt = {
        "source_url": REQUEST_URL,
        "retrieved_at_utc": "2000-01-01T00:00:00+00:00",
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    return body, receipt


def test_missing_months_and_annual_summaries(synthetic_payload):
    values = synthetic_payload["properties"]["parameter"]["T2M"]
    del values["199901"]
    values["200002"] = -999
    values["200113"] = -999
    monthly, provenance, coverage = validate_response(*serialize_fixture(synthetic_payload))
    result = build_result(monthly, provenance, coverage)

    assert coverage["valid_months"] == 538
    assert coverage["absent_months"] == ["1999-01"]
    assert coverage["fill_value_months"] == ["2000-02"]
    assert coverage["ignored_annual_summaries"] == 45
    assert result["completeness"]["excluded_calendar_years"] == [1999, 2000]
    assert result["annual_series"][18] == {"year": 1999, "temperature_c": None}


def test_partial_boundary_month_is_excluded(synthetic_payload):
    synthetic_payload["header"]["end"] = "20251215"
    _, _, coverage = validate_response(*serialize_fixture(synthetic_payload))

    assert coverage["valid_months"] == 539
    assert coverage["partial_months"] == ["2025-12"]


def test_validates_year_month_units_and_checksum(synthetic_payload):
    body, receipt = serialize_fixture(synthetic_payload)
    with pytest.raises(ValueError, match="SHA-256"):
        validate_response(body + b" ", receipt)

    synthetic_payload["parameters"]["T2M"]["units"] = "K"
    with pytest.raises(ValueError, match="metadata"):
        validate_response(*serialize_fixture(synthetic_payload))

    synthetic_payload["parameters"]["T2M"]["units"] = "C"
    synthetic_payload["properties"]["parameter"]["T2M"]["202514"] = 25
    with pytest.raises(ValueError, match="year or month"):
        validate_response(*serialize_fixture(synthetic_payload))


def test_json_structure_and_data_provenance(synthetic_payload):
    body, receipt = serialize_fixture(synthetic_payload)
    result = json.loads(json_bytes(build_result(*validate_response(body, receipt))))

    assert set(result) == {
        "schema_version", "location", "dataset", "requested_years", "years_analyzed",
        "valid_annual_observations", "annual_series", "trend", "completeness",
        "provenance", "limitations",
    }
    assert result["schema_version"] == 1
    assert result["valid_annual_observations"] == 45
    assert result["years_analyzed"] == {"start": 1981, "end": 2025}
    assert result["dataset"]["units"] == "°C"
    assert list(result["annual_series"][0]) == ["year", "temperature_c"]
    assert result["trend"]["slope_c_per_decade"] == pytest.approx(0.5, abs=0.0001)
    assert result["provenance"]["source_url"] == REQUEST_URL
    assert result["provenance"]["retrieved_at_utc"] == receipt["retrieved_at_utc"]
    assert result["provenance"]["sha256"] == hashlib.sha256(body).hexdigest()
    assert result["provenance"]["header"]["sources"] == ["MERRA2"]


def test_api_failure_propagates_without_creating_a_cache(tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise URLError("controlled connection failure")

    monkeypatch.setattr("science.power.urlopen", fail)
    with pytest.raises(URLError, match="controlled connection failure"):
        load_monthly(tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_real_snapshot_is_complete_and_matches_cached_provenance():
    monthly, provenance, coverage = load_monthly(ROOT / "data" / "raw")
    assert coverage["requested_months"] == coverage["valid_months"] == 540
    assert provenance["header"]["start"] == "19810101"
    assert provenance["header"]["end"] == "20251231"
    assert monthly.iloc[0] == pytest.approx(19.31)


@pytest.mark.parametrize("bad_coordinate", [True, None, float("nan")])
def test_rejects_invalid_returned_coordinate(synthetic_payload, bad_coordinate):
    synthetic_payload["geometry"]["coordinates"][0] = bad_coordinate
    # json.dumps can serialize NaN even though it is outside the JSON standard.
    body = json.dumps(synthetic_payload).encode()
    _, receipt = serialize_fixture({})
    receipt["sha256"] = hashlib.sha256(body).hexdigest()
    with pytest.raises(ValueError, match="Unexpected NASA point coordinates"):
        validate_response(body, receipt)
