"""Verify the saved worldwide artifact and the local monthly baseline."""

import json

import numpy as np
import pandas as pd
import pytest

from science.world import CACHE, OUTPUT, build_world, month_calendar


def test_calendar_baseline_is_seasonal_and_missing_months_remain_missing():
    dates = pd.period_range("1981-01", "2025-12", freq="M")
    # Explicit synthetic test fixture with a steady seasonal cycle.
    values = pd.Series(dates.month.to_numpy(dtype=float), index=dates)
    values["2025-01"] += 2
    values["2025-02"] = np.nan
    values["1999-03"] = np.nan
    result = month_calendar(values)
    assert result["baseline_c"][:4] == [1.0, 2.0, None, 4.0]
    assert result["anomaly_c"][-12:-8] == [2.0, None, None, 0.0]


def test_world_snapshot_reproduces_and_preserves_karachi():
    saved = json.loads(OUTPUT.read_bytes())
    actual = build_world(CACHE, offline=True)
    assert actual["excluded_sites"] == actual["duplicate_pairs"] == []
    assert len(actual["stations"]) == 31
    assert len({site["continent"] for site in actual["stations"]}) == 6
    for computed, exported in zip(actual["stations"], saved["stations"], strict=True):
        assert computed["id"] == exported["id"]
        assert computed["provenance"] == exported["provenance"]
        assert computed["calendar"] == exported["calendar"]
        assert len(computed["calendar"]["anomaly_c"]) == 540
        assert computed["completeness"]["complete_calendar_years"] == 45
        for left, right in zip(computed["windows"], exported["windows"], strict=True):
            assert left["valid_years"] == right["valid_years"]
            assert left["trend"]["slope_c_per_decade"] == pytest.approx(right["trend"]["slope_c_per_decade"])
            assert left["trend"]["hac"]["confidence_interval"] == pytest.approx(right["trend"]["hac"]["confidence_interval"])
    karachi = next(site for site in actual["stations"] if site["id"] == "karachi")
    assert karachi["native_cell"] == {"latitude": 25.0, "longitude": 66.875}
    assert karachi["windows"][0]["trend"]["slope_c_per_decade"] == pytest.approx(0.11410459618)
