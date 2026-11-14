"""Regression and independent checks for the GISTEMP product."""

import calendar
import gzip
import json

import numpy as np
import pandas as pd
import pytest
import xarray as xr
from scipy.io import netcdf_file
from scipy.stats import linregress

from science.gistemp import (
    ARCHIVE, GLOBAL_CSV, MISSING, OUTPUT, RAW, SCALE, YEARS,
    annual_means, canonical_grid, global_check, map_grid, selected_months, trend, validate_snapshot,
)


def test_grid_orientation_and_wrapped_longitudes():
    lat = np.arange(-89, 90, 2)
    lon = np.arange(1, 360, 2)
    values = lat[:, None] * 1000 + lon
    raw = xr.DataArray(values.T[..., None], dims=("lon", "lat", "time"), coords={"lat": lat, "lon": lon})
    grid = canonical_grid(raw)
    assert grid.dims == ("time", "lat", "lon")
    assert grid.lat.values[[0, -1]].tolist() == [89, -89]
    assert grid.lon.values[[0, -1]].tolist() == [-179, 179]
    assert grid.sel(lat=25, lon=-179).item() == 25181
    assert grid.sel(lat=-43, lon=179).item() == -42821
    with pytest.raises(ValueError):
        canonical_grid(raw.isel(lon=slice(1, None)))


def test_selects_exact_calendar_months_and_rejects_incomplete_axis():
    time = pd.date_range("1980-01-01", "2026-02-01", freq="MS")
    monthly = xr.DataArray(np.zeros(len(time)), coords={"time": time}, dims=("time",))
    selected = selected_months(monthly, YEARS)
    assert selected.size == 540
    assert selected.time.dt.year.values[[0, -1]].tolist() == [1981, 2025]
    with pytest.raises(ValueError, match="duplicating"):
        selected_months(monthly.isel(time=np.r_[0:13, 14:len(time)]), YEARS)


def test_leap_month_weights_and_missing_values():
    years = np.array([1999, 2000])
    monthly = np.zeros((24, 2))
    monthly[1, :] = monthly[13, :] = 1
    monthly[12, 1] = np.nan
    annual = annual_means(monthly, years)
    np.testing.assert_allclose(annual[:, 0], [28 / 365, 29 / 366])
    assert np.isnan(annual[1, 1])
    assert annual[0, 1] == pytest.approx(28 / 365)


def test_known_slope_elapsed_decades_and_insufficient_record():
    values = np.repeat((1.2 + 0.025 * (YEARS - YEARS[0]))[:, None], 3, axis=1)
    values[[0, 6, 19, 44], 1] = np.nan
    values[:6, 2] = np.nan
    rate, intercept, count = trend(values, YEARS)
    np.testing.assert_allclose(rate[:2], [0.25, 0.25])
    np.testing.assert_allclose(intercept[:2], [1.2, 1.2])
    assert count.tolist() == [45, 41, 39]
    assert np.isnan(rate[2])
    assert map_grid(rate).tolist() == [2500, 2500, MISSING]


@pytest.fixture(scope="module")
def artifacts():
    manifest = json.loads((OUTPUT / "manifest.json").read_bytes())
    raster = np.fromfile(OUTPUT / "slopes.bin", dtype="<i2").reshape(manifest["rows"], manifest["columns"])
    rows = [json.loads((OUTPUT / f"row-{row}.json").read_bytes()) for row in range(manifest["rows"])]
    return manifest, raster, rows


def test_artifact_schema_and_map_detail_consistency(artifacts):
    manifest, raster, rows = artifacts
    assert manifest["schema_version"] == 1
    assert manifest["period"] == [1981, 2025]
    assert manifest["baseline"] == [1951, 1980]
    assert manifest["metadata"]["native_units"] == "K"
    assert manifest["units"] == "\N{DEGREE SIGN}C/decade"
    assert raster.shape == (90, 180)
    assert manifest["valid_cells"] == int((raster != MISSING).sum())
    assert manifest["valid_cells"] > 15_000
    full = 0
    for row, row_detail in enumerate(rows):
        assert len(row_detail) == 180
        for col, (slope, intercept, annual) in enumerate(row_detail):
            assert len(annual) == 45
            count = sum(value is not None for value in annual)
            full += count == 45
            if count < manifest["minimum_complete_years"]:
                assert raster[row, col] == MISSING
                assert slope is intercept is None
            else:
                assert np.isfinite([slope, intercept]).all()
                assert raster[row, col] / SCALE == pytest.approx(slope, abs=0.00005 + 0.00000001)
    assert full == manifest["full_record_cells"]


def test_real_snapshot_with_independent_raw_reader_and_regression(artifacts, tmp_path):
    manifest, raster, details = artifacts
    src = RAW / ARCHIVE
    validate_snapshot(src, manifest["source"])
    path = tmp_path / "gistemp.nc"
    import shutil
    with gzip.open(src, "rb") as archived, path.open("wb") as nc:
        shutil.copyfileobj(archived, nc)

    nc = netcdf_file(path, mmap=False)
    try:
        var = nc.variables["tempanomaly"]
        assert var.units == b"K"  # A delta in K has the same magnitude in degrees Celsius.
        assert var._FillValue == 32767
        lats = nc.variables["lat"][:]
        lons = nc.variables["lon"][:]
        times = pd.Timestamp("1800-01-01") + pd.to_timedelta(nc.variables["time"][:], unit="D")
        sampled = (times.year >= 1981) & (times.year <= 2025)
        assert sampled.sum() == 540
        for lat, lon in [(25, 67), (89, -179), (1, 179), (-43, -75), (61, 11), (-89, 179)]:
            y = np.flatnonzero(lats == lat)[0]
            x = np.flatnonzero(lons == lon)[0]
            samples = var[sampled, y, x].reshape(45, 12)
            years, means = [], []
            for year, months in zip(YEARS, samples, strict=True):
                if 32767 not in months:
                    days = [calendar.monthrange(int(year), month)[1] for month in range(1, 13)]
                    years.append(year)
                    means.append(np.dot(months.astype(float) / 100, days) / sum(days))
            row, col = (89 - lat) // 2, (179 + lon) // 2
            slope, _, chart = details[row][col]
            present = [value for value in chart if value is not None]
            assert present == pytest.approx(means, abs=0.000006)
            if len(years) >= manifest["minimum_complete_years"]:
                expected = linregress(np.array(years) / 10, means).slope
                assert slope == pytest.approx(expected, abs=0.0000001)
                assert raster[row, col] / SCALE == pytest.approx(expected, abs=0.00005)
            else:
                assert slope is None
                assert raster[row, col] == MISSING
    finally:
        nc.close()


def test_global_sanity_independently_from_delivered_series(artifacts):
    manifest, _, details = artifacts
    validate_snapshot(RAW / GLOBAL_CSV, manifest["global_table"])
    annual = np.array([[cell[2] for cell in row] for row in details], dtype=float).transpose(2, 0, 1)
    result = global_check(annual, RAW / GLOBAL_CSV)
    assert result["correlation"] == pytest.approx(manifest["sanity_check"]["correlation"], abs=1e-6)
    assert result["diagnostic_slope_c_per_decade"] == pytest.approx(
        manifest["sanity_check"]["diagnostic_slope_c_per_decade"], abs=1e-6
    )
