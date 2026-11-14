"""Build complete-year means and estimate linear trend uncertainty."""

import math

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats
from statsmodels.stats.sandwich_covariance import S_hac_simple

MIN_YEARS = 5
CONFIDENCE_LEVEL = 0.95


def annual_means(monthly: pd.Series) -> pd.Series:
    days = monthly.index.days_in_month
    years = monthly.index.year
    complete = monthly.groupby(years).count().eq(12)
    yearly = (monthly * days).groupby(years).sum() / pd.Series(days).groupby(years).sum()
    return yearly.loc[complete]


def uncertainty(slope: float, variance: float, df: int) -> dict:
    if not math.isfinite(variance) or variance <= 0:
        return {"standard_error": None, "confidence_interval": None, "p_value": None}

    standard_error = math.sqrt(variance)
    critical = float(stats.t.ppf((1 + CONFIDENCE_LEVEL) / 2, df))
    margin = critical * standard_error
    return {
        "standard_error": standard_error,
        "confidence_interval": [slope - margin, slope + margin],
        "p_value": float(2 * stats.t.sf(abs(slope) / standard_error, df)),
    }


def fit_trend(annual: pd.Series) -> dict:
    annual = annual.sort_index()
    n = len(annual)
    if n < MIN_YEARS:
        raise ValueError(f"Trend needs at least {MIN_YEARS} complete calendar years; found {n}.")
    if not annual.index.is_unique or not np.isfinite(annual.to_numpy()).all():
        raise ValueError("Trend needs distinct years and finite annual means.")

    years = annual.index.to_numpy(dtype=int)
    temperature = annual.to_numpy(dtype=float)
    time_decades = (years - years[0]) / 10.0
    design = sm.add_constant(time_decades)
    fit = sm.OLS(temperature, design).fit()
    constant = np.all(temperature == temperature[0])
    slope = 0.0 if constant else float(fit.params[1])
    baseline = float(temperature[0] if constant else fit.params[0])
    df = n - design.shape[1]

    # Missing calendar years contribute no score and keep a lag of one equal to one year.
    # Bartlett weights and finite-sample n/(n-k) reproduce statsmodels HAC for complete series.
    lag = math.floor(4 * (n / 100) ** (2 / 9))
    scores = np.zeros((years[-1] - years[0] + 1, design.shape[1]))
    scores[years - years[0]] = design * fit.resid[:, None]
    bread = fit.normalized_cov_params
    robust = (bread @ S_hac_simple(scores, nlags=lag) @ bread) * (n / df)

    degenerate = np.max(np.abs(fit.resid)) <= 32 * np.finfo(float).eps * max(
        1.0, np.max(np.abs(temperature))
    )
    conventional_variance = 0.0 if degenerate else float(fit.cov_params()[1, 1])
    hac_variance = 0.0 if degenerate else float(robust[1, 1])
    return {
        "model": "Ordinary least squares with intercept",
        "slope_c_per_decade": slope,
        "intercept_c": baseline,
        "reference_year": int(years[0]),
        "degrees_of_freedom": df,
        "confidence_level": CONFIDENCE_LEVEL,
        "conventional": uncertainty(slope, conventional_variance, df),
        "hac": {
            **uncertainty(slope, hac_variance, df),
            "kernel": "Bartlett",
            "max_lag_years": lag,
            "bandwidth_rule": "floor(4 × (n / 100)^(2/9))",
            "small_sample_correction": "n / (n − 2)",
            "reference_distribution": "Student t (n − 2 degrees of freedom, approximate)",
        },
    }
