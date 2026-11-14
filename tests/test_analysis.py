"""Controlled synthetic regression fixtures. No production observations are invented here."""

import math

import numpy as np
import pandas as pd
import pytest
import statsmodels.api as sm
from scipy import stats

from science.analysis import annual_means, fit_trend


def test_annual_means_weight_days_and_exclude_incomplete_year():
    months = pd.period_range("1999-01", "2001-12", freq="M")
    monthly = pd.Series(0.0, index=months)
    monthly.loc[["1999-02", "2000-02"]] = 10.0
    monthly.loc["2001-12"] = np.nan

    annual = annual_means(monthly)

    assert list(annual.index) == [1999, 2000]
    assert annual[1999] == pytest.approx(280 / 365)
    assert annual[2000] == pytest.approx(290 / 366)


def test_constant_series_has_zero_slope_and_undefined_inference():
    fit = fit_trend(pd.Series(26.0, index=range(2000, 2010)))

    assert fit["slope_c_per_decade"] == 0.0
    assert fit["intercept_c"] == 26.0
    for method in ("conventional", "hac"):
        assert fit[method]["confidence_interval"] is None
        assert fit[method]["p_value"] is None


def test_known_slope_is_expressed_per_decade():
    years = np.arange(2000, 2020)
    annual = pd.Series(20 + 0.125 * (years - 2000), index=years)
    fit = fit_trend(annual)

    assert fit["slope_c_per_decade"] == pytest.approx(1.25)
    assert fit["intercept_c"] == pytest.approx(20.0)
    assert fit["reference_year"] == 2000


def test_insufficient_observations():
    with pytest.raises(ValueError, match="at least 5 complete calendar years"):
        fit_trend(pd.Series([1.0, 2.0], index=[2000, 2001]))


def test_intervals_and_p_values_agree_with_independent_library_entry_points():
    temperature = np.array([24.5, 25.0, 25.4, 25.2, 24.9, 25.7, 26.0, 25.8, 25.6, 26.2])
    x = np.arange(len(temperature)) / 10
    fit = fit_trend(pd.Series(temperature, index=range(2000, 2010)))
    ordinary = stats.linregress(x, temperature)
    critical = stats.t.ppf(0.975, len(temperature) - 2)

    assert fit["conventional"]["p_value"] == pytest.approx(ordinary.pvalue)
    assert fit["conventional"]["confidence_interval"] == pytest.approx([
        ordinary.slope - critical * ordinary.stderr, ordinary.slope + critical * ordinary.stderr,
    ])

    benchmark = sm.OLS(temperature, sm.add_constant(x)).fit(
        cov_type="HAC",
        cov_kwds={"maxlags": fit["hac"]["max_lag_years"], "use_correction": True},
        use_t=True,
    )
    assert fit["hac"]["p_value"] == pytest.approx(benchmark.pvalues[1])
    assert fit["hac"]["confidence_interval"] == pytest.approx(benchmark.conf_int()[1])


def test_hac_uses_calendar_lags_with_missing_years():
    annual = pd.Series([24.5, 25.3, 25.0, 25.5, 26.0, 25.7], index=[2000, 2001, 2003, 2007, 2008, 2009])
    fit = fit_trend(annual)
    years = annual.index.to_numpy()
    x = (years - years[0]) / 10
    centered = x - np.mean(x)
    residual = annual.to_numpy() - (fit["intercept_c"] + fit["slope_c_per_decade"] * x)
    score = centered * residual / np.sum(centered ** 2)
    lag = fit["hac"]["max_lag_years"]
    variance = sum(
        left * right * (1 - distance / (lag + 1))
        for left_year, left in zip(years, score)
        for right_year, right in zip(years, score)
        if (distance := abs(left_year - right_year)) <= lag
    ) * len(years) / (len(years) - 2)

    assert fit["hac"]["standard_error"] == pytest.approx(math.sqrt(variance))
