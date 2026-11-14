"""Calibrate the published annual HAC recipe on declared synthetic scenarios.

Run with python -m science.verdict_audit. Existing NASA artifacts are read only.
"""
import calendar
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
TRIALS = 5000
LENGTHS = (25, 35, 45, 100)
TRAIN = ("iid", "ar1:-.3", "ar1:.3", "ar1:.6", "ma1:.5", "variance_ramp")
HOLDOUT = (*TRAIN, "ar1:.45", "ar1:.8", "ar1:.9", "ma1:.75", "ar2", "heavy_tail_ar1")


def errors(rng, process, length, trials):
    """Unit innovation variance, with a burn-in for the stationary recursions."""
    innovation = rng.normal(size=(trials, length + 200))
    if process == "iid":
        return innovation[:, -length:]
    if process == "variance_ramp":
        return innovation[:, -length:] * np.linspace(.4, 1.6, length)
    if process.startswith("ma1:"):
        return innovation[:, -length:] + float(process[4:]) * innovation[:, -length-1:-1]
    if process == "heavy_tail_ar1":
        innovation = rng.standard_t(5, size=innovation.shape) * np.sqrt(3 / 5)
        coefficients = (.6, 0)
    elif process == "ar2":
        coefficients = (.65, .25)
    else:
        coefficients = (float(process[4:]), 0)
    for i in range(2, innovation.shape[1]):
        innovation[:, i] += coefficients[0] * innovation[:, i-1] + coefficients[1] * innovation[:, i-2]
    return innovation[:, -length:]


def fit_batch(y, years):
    """Slope score form of Bartlett HAC for a contiguous annual fit."""
    x = (years - years.mean()) / 10
    n = x.size
    xx = x @ x
    slope = np.sum(y * x, axis=-1) / xx
    residuals = y - y.mean(axis=-1)[..., None] - slope[..., None] * x
    conventional = np.sqrt(np.sum(residuals**2, axis=-1) / ((n - 2) * xx))
    influence = residuals * x / xx
    variance = np.sum(influence**2, axis=-1)
    lags = math.floor(4 * (n / 100)**(2 / 9))
    for lag in range(1, lags + 1):
        variance += 2 * (1 - lag / (lags + 1)) * np.sum(influence[..., lag:] * influence[..., :-lag], axis=-1)
    return slope, conventional, np.sqrt(variance * n / (n - 2)), lags


def coverage(mask):
    count = int(np.count_nonzero(mask))
    ci = stats.binomtest(count, mask.size).proportion_ci(method="wilson")
    return {"covered": count, "trials": mask.size, "fraction": count / mask.size,
            "monte_carlo_95_wilson": [float(ci.low), float(ci.high)]}


def simulate(trials=TRIALS):
    train_rng = np.random.default_rng(2026111501)
    validation_rng = np.random.default_rng(2026111502)
    out = []
    for n in LENGTHS:
        years = np.arange(1981, 1981 + n)
        nominal = stats.t.ppf(.975, n - 2)
        train_quantiles = {}
        for process in TRAIN:
            slope, _, hac, _ = fit_batch(errors(train_rng, process, n, trials), years)
            train_quantiles[process] = float(np.quantile(np.abs(slope) / hac, .95))
        cutoff = max(nominal, *train_quantiles.values())
        for process in HOLDOUT:
            slope, conventional, hac, lags = fit_batch(errors(validation_rng, process, n, trials), years)
            out.append({"years": n, "process": process, "seen_in_calibration": process in TRAIN,
                        "lags": lags, "nominal_t_cutoff": float(nominal), "calibrated_cutoff": cutoff,
                        "conventional": coverage(np.abs(slope) <= nominal * conventional),
                        "hac": coverage(np.abs(slope) <= nominal * hac),
                        "calibrated_hac": coverage(np.abs(slope) <= cutoff * hac)})
    return out


def case_study():
    """Recompute from raw months, independent of the production region code."""
    raw_path = ROOT / "data/raw/nasa-power-karachi-t2m-1981-2025.json"
    payload = raw_path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    receipt = json.loads(raw_path.with_suffix(".source.json").read_text(encoding="utf-8"))
    if receipt["sha256"] != digest:
        raise ValueError("Raw Karachi provenance checksum mismatch")
    months = json.loads(payload)["properties"]["parameter"]["T2M"]
    regional = json.loads((ROOT / "data/results/world-t2m.v1.json").read_text(encoding="utf-8"))
    station = next(site for site in regional["stations"] if site["id"] == "karachi")
    windows = []
    for start, end in [(1981, 2025), (2001, 2025)]:
        years = np.arange(start, end + 1)
        days = [[calendar.monthrange(int(y), m)[1] for m in range(1, 13)] for y in years]
        values = [[months[f"{y}{m:02}"] for m in range(1, 13)] for y in years]
        if not np.isfinite(values).all() or np.min(values) <= -999:
            raise ValueError("Case-study month missing")
        annual = np.sum(np.array(values) * days, axis=1) / np.sum(days, axis=1)
        slope, ols, hac, lags = fit_batch(annual, years)
        scipy_fit = stats.linregress(years / 10, annual)
        assert np.isclose(slope, scipy_fit.slope) and np.isclose(ols, scipy_fit.stderr)
        t = stats.t.ppf(.975, len(years) - 2)
        intervals = {"conventional": [float(slope - t * ols), float(slope + t * ols)],
                     "hac": [float(slope - t * hac), float(slope + t * hac)]}
        reference = next(x["trend"] for x in station["windows"] if x["start"] == start and x["end"] == end)
        np.testing.assert_allclose(slope, reference["slope_c_per_decade"], atol=1e-10)
        for name, bounds in intervals.items():
            np.testing.assert_allclose(bounds, reference[name]["confidence_interval"], atol=1e-10)
        windows.append({"start": start, "end": end, "complete_years": len(years),
                        "slope_c_per_decade": float(slope), "lags": lags, "nominal_intervals": intervals})
    return {"name": "Karachi", "source_sha256": digest, "windows": windows,
            "selection": "Exploratory demonstration selected from existing NASA POWER results."}


def main():
    out = {"schema_version": 1, "synthetic": True, "true_slope": 0, "training_seed": 2026111501,
           "validation_seed": 2026111502, "training_processes": list(TRAIN),
           "validation_processes": list(HOLDOUT), "lengths": list(LENGTHS),
           "promotion_gate": "At least 93% empirical coverage in every declared holdout scenario. Diagnostic threshold, not proof of 95% coverage.",
           "rows": simulate(), "case_study": case_study()}
    out["passes_promotion_gate"] = all(row["calibrated_hac"]["fraction"] >= .93 for row in out["rows"])
    path = ROOT / "public/evidence-verification.v1.json"
    path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("Validation scenarios:", len(out["rows"]), "candidate gate:", out["passes_promotion_gate"])
    print(json.dumps(out["case_study"], indent=2))


if __name__ == "__main__":
    main()
