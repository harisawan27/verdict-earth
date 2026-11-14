"""Independent checks of the case study and the batch calibration recipe."""
import json

import numpy as np
import statsmodels.api as sm

from science.verdict_audit import ROOT, case_study, errors, fit_batch, simulate


def test_batch_matches_independent_analytic_and_software_references():
    rng = np.random.default_rng(31)
    for process, n in [("iid", 25), ("ar1:.6", 35), ("ma1:.75", 45), ("ar2", 100)]:
        years = np.arange(1900, 1900 + n)
        time = (years - years[0]) / 10
        y = errors(rng, process, n, 3) + 0.25 * time
        slope, convention, hac, lag = fit_batch(y, years)
        for i, temperatures in enumerate(y):
            reference = sm.OLS(temperatures, sm.add_constant(time)).fit()
            robust = reference.get_robustcov_results(cov_type="HAC", maxlags=lag, use_correction=True)
            np.testing.assert_allclose([slope[i], convention[i], hac[i]],
                                       [reference.params[1], reference.bse[1], robust.bse[1]], rtol=1e-10)
        shifted, _, shifted_hac, _ = fit_batch(y - .25 * time, years)
        np.testing.assert_allclose(slope - shifted, .25)
        np.testing.assert_allclose(hac, shifted_hac)


def test_committed_simulations_reproduce_and_candidate_fails_holdout():
    audit = json.loads((ROOT / "public/evidence-verification.v1.json").read_text(encoding="utf-8"))
    actual = simulate()
    assert len(actual) == len(audit["rows"]) == 48
    for row, public in zip(actual, audit["rows"], strict=True):
        assert (row["years"], row["process"]) == (public["years"], public["process"])
        for method in ["conventional", "hac", "calibrated_hac"]:
            assert row[method]["covered"] == public[method]["covered"]
            assert row[method]["trials"] == public[method]["trials"] == 5000
        np.testing.assert_allclose(row["calibrated_cutoff"], public["calibrated_cutoff"])
    assert not audit["passes_promotion_gate"]
    assert any(row["calibrated_hac"]["fraction"] < .93 and not row["seen_in_calibration"] for row in actual)


def test_karachi_recomputed_from_raw_matches_published_case():
    audit = json.loads((ROOT / "public/evidence-verification.v1.json").read_text(encoding="utf-8"))
    independent = case_study()
    assert independent["source_sha256"] == audit["case_study"]["source_sha256"]
    full, recent = independent["windows"]
    assert full["complete_years"] == 45 and recent["complete_years"] == 25
    for result, claimed in zip(independent["windows"], audit["case_study"]["windows"], strict=True):
        np.testing.assert_allclose(result["slope_c_per_decade"], claimed["slope_c_per_decade"])
        for method in ["conventional", "hac"]:
            np.testing.assert_allclose(result["nominal_intervals"][method], claimed["nominal_intervals"][method])
    assert all(bounds[0] > 0 for bounds in full["nominal_intervals"].values())
    assert recent["nominal_intervals"]["conventional"][0] < 0 < recent["nominal_intervals"]["conventional"][1]
    assert recent["nominal_intervals"]["hac"][0] > 0
