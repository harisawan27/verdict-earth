"""Regression checks for real snapshots and a declared synthetic AR(1) fixture."""

import json

import numpy as np
import pandas as pd
import pytest

from science.analysis import annual_means, fit_trend
from science.generate import ROOT
from science.power import load_monthly
from science.region import OUTPUT, build_region, candidate_native_cells, detect_duplicates, window_results


@pytest.fixture(scope="module")
def regional_result():
    return build_region(ROOT / "data" / "raw")


def test_generated_snapshot_reproduces_baseline_and_real_regional_values(regional_result):
    saved = json.loads(OUTPUT.read_bytes())
    baseline = json.loads((ROOT / "data" / "results" / "karachi-t2m.v1.json").read_bytes())
    assert len(saved["stations"]) == 8
    for station, published in zip(regional_result["stations"], saved["stations"], strict=True):
        assert station["id"] == published["id"]
        assert station["completeness"]["valid_months"] == 540
        assert station["completeness"]["complete_calendar_years"] == 45
        monthly, _, _ = load_monthly(
            ROOT / "data" / "raw", slug=station["id"],
            latitude=station["latitude"], longitude=station["longitude"],
        )
        days = monthly.index.days_in_month.to_numpy().reshape(-1, 12)
        expected = (monthly.to_numpy().reshape(-1, 12) * days).sum(axis=1) / days.sum(axis=1)
        assert [row["temperature_c"] for row in station["annual_series"]] == pytest.approx(expected)
        assert [row["temperature_c"] for row in published["annual_series"]] == pytest.approx(expected)
        for actual, exported in zip(station["windows"], published["windows"], strict=True):
            years = list(range(actual["start"], actual["end"] + 1))
            assert actual["valid_years"] == exported["valid_years"] == years
            truth = np.polyfit(np.array(years) / 10, expected[np.array(years) - 1981], 1)[0]
            assert actual["trend"]["slope_c_per_decade"] == pytest.approx(truth)
            assert exported["trend"]["slope_c_per_decade"] == pytest.approx(truth)
            for method in ["conventional", "hac"]:
                assert exported["trend"][method]["confidence_interval"] == pytest.approx(
                    actual["trend"][method]["confidence_interval"]
                )
                assert exported["trend"][method]["p_value"] == pytest.approx(actual["trend"][method]["p_value"])

    karachi = regional_result["stations"][0]
    assert karachi["annual_series"] == baseline["annual_series"]
    assert karachi["windows"][0]["trend"] == baseline["trend"]


def test_all_real_sites_match_distinct_native_cells(regional_result):
    locations = [site["native_cell"] for site in regional_result["stations"]]
    assert all(locations)
    assert len({(item["latitude"], item["longitude"]) for item in locations}) == 8
    assert locations[0] == {"latitude": 25.0, "longitude": 66.875}
    assert regional_result["duplicate_pairs"] == []


def test_detect_duplicate_native_cells_and_identical_series():
    one = {
        "id": "one", "latitude": 25.0, "longitude": 66.875,
        "candidate_native_cells": candidate_native_cells(25.0, 66.875),
        "native_cell": {"latitude": 25.0, "longitude": 66.875},
        "monthly_values": np.arange(12, dtype=float),
    }
    two = {**one, "id": "two", "latitude": 25.12}
    match, = detect_duplicates([one, two])
    assert match["sites"] == ["one", "two"]
    assert match["reasons"] == ["same verified native cell", "identical monthly series"]


def test_window_support_and_missing_year_remain_explicit():
    years = [1981, 1982, 1983, 1984, 1986, 1991]
    results = window_results(pd.Series([25, 25.1, 25.3, 25.4, 25.1, 25.5], index=years))
    assert [result["id"] for result in results] == ["1981-2025", "1981-2015"]
    assert all(result["valid_years"] == years for result in results)


def test_seeded_ar1_inference_calibration():
    # Under a zero slope and positive AR(1) errors, independent-error inference
    # should undercover. HAC can improve coverage, but need not attain nominal 95%.
    rng = np.random.default_rng(290615)
    rho = 0.6
    tracked = {"conventional": 0, "hac": 0}
    trials, duration = 400, 100
    years = np.arange(1900, 1900 + duration)
    for _ in range(trials):
        innovations = rng.normal(size=duration)
        series = innovations.copy()
        series[0] /= np.sqrt(1 - rho**2)
        for index in range(1, duration):
            series[index] += rho * series[index - 1]
        fit = fit_trend(pd.Series(series, index=years))
        for method in tracked:
            lower, upper = fit[method]["confidence_interval"]
            tracked[method] += lower <= 0 <= upper
    assert tracked["conventional"] / trials < 0.90
    assert tracked["hac"] > tracked["conventional"] + 0.10 * trials
