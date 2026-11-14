"""Validate controlled CSV fixtures and the archived NASA Giovanni export."""

import pandas as pd
import pytest

from science.giovanni import build_comparison, parse_export


def fixture(months, missing=None):
    lines = [
        "Title,Time Series Area-Averaged of 2-meter air temperature (M2TMNXSLV v5.12.4)",
        "time,M2TMNXSLV_5_12_4_T2M (K)",
    ]
    for index, month in enumerate(months):
        value = "-999" if month == missing else str(298.15 + 0.02 * index)
        lines.append(f"{month}-01T00:00:00Z,{value}")
    return "\n".join(lines).encode()


def test_import_converts_kelvin_and_compares_only_shared_complete_years():
    index = pd.period_range("1981-01", "1987-12", freq="M")
    values = parse_export(fixture(index, pd.Period("1983-05", freq="M")), "K")
    power = pd.Series(25.0, index=index)
    power.loc["1985-01"] = float("nan")
    result = build_comparison(values, power, {"fixture": True})
    assert result["shared_complete_years"] == [1981, 1982, 1984, 1986, 1987]
    assert values[index[0]] == pytest.approx(25)
    assert result["power_trend"]["slope_c_per_decade"] == 0
    assert result["giovanni_trend"]["slope_c_per_decade"] == pytest.approx(2.4, rel=0.001)


def test_import_rejects_wrong_product_trailing_rows_and_conflicting_units():
    months = pd.period_range("1981-01", "1981-02", freq="M")
    raw = fixture(months)
    with pytest.raises(ValueError, match="M2TMNXSLV"):
        parse_export(raw.replace(b"M2TMNXSLV", b"OTHER"), "K")
    with pytest.raises(ValueError, match="trailing CSV"):
        parse_export(raw + b"\nfooter,text", "K")
    with pytest.raises(ValueError, match="units"):
        parse_export(raw, "C")
    with pytest.raises(ValueError, match="duplicate Giovanni month"):
        parse_export(raw + b"\n1981-02-01,298", "K")


def test_comparison_rejects_fewer_than_five_common_years():
    index = pd.period_range("1981-01", "1984-12", freq="M")
    with pytest.raises(ValueError, match="5 common complete years"):
        build_comparison(parse_export(fixture(index), "K"), pd.Series(25.0, index=index), {})


def test_saved_giovanni_export_matches_the_checked_in_comparison():
    import hashlib
    import json

    from science.generate import ROOT
    from science.giovanni import export_metadata
    from science.power import load_monthly

    saved = json.loads((ROOT / "data/results/giovanni-karachi.v1.json").read_bytes())
    file = saved["provenance"]["files"][0]
    raw = (ROOT / file["path"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == file["sha256"]
    metadata = export_metadata(raw)
    assert metadata["sampled_bounds_wsen"] == [66.875, 25, 66.875, 25]
    assert metadata["reproduction_url"] == file["reproduction_url"]
    with pytest.raises(ValueError, match="expected Karachi grid cell"):
        export_metadata(raw.replace(b'66.875,25,66.875,25', b'67.5,25,67.5,25'))

    power, _, _ = load_monthly(ROOT / "data/raw")
    months = parse_export(raw, "K")
    calculated = build_comparison(months, power, saved["provenance"])
    assert calculated["valid_months"] == calculated["matched_months"] == 540
    assert len(calculated["shared_complete_years"]) == 45
    assert calculated["shared_complete_years"] == saved["shared_complete_years"]
    for key in ("giovanni_trend", "power_trend"):
        assert calculated[key]["slope_c_per_decade"] == pytest.approx(saved[key]["slope_c_per_decade"])
        for method in ("conventional", "hac"):
            assert calculated[key][method]["confidence_interval"] == pytest.approx(
                saved[key][method]["confidence_interval"]
            )
    assert calculated["monthly_mean_absolute_difference_c"] == pytest.approx(
        saved["monthly_mean_absolute_difference_c"]
    )
