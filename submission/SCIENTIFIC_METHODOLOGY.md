# Scientific methodology

## From monthly data to trends

NASA POWER delivers monthly mean 2-meter air temperature (T2M) derived from MERRA-2 in degrees Celsius. The native meteorological grid has 0.5° latitude by 0.625° longitude spacing. The 31 atlas point requests and all eight regional requests cover January 1981 through December 2025. The pipeline checks the request metadata, returned coordinates, dates, units, fill values, and original SHA-256 checksum. The 2023 regional grid export uniquely matches 12 monthly values to each of eight distinct native cells. Karachi's request at 24.9° N, 67.0° E maps to the cell centered at 25° N, 66.875° E.

A calendar year is eligible when all 12 months are valid. The mean weights each month by its calendar days, including leap days. Each study window uses ordinary least squares with an intercept and elapsed calendar decades. Windows are 1981–2025, 1991–2025, 2001–2025, and 1981–2015.

## Uncertainty and interpretation

Both methods use the same observations and estimated slope. The conventional two-sided Student t interval and p-value use n−2 degrees of freedom and assume independent, constant-variance residuals. The Newey–West heteroskedasticity and autocorrelation consistent (HAC) covariance uses Bartlett weights, floor(4 × (n/100)^(2/9)) annual lags, and the finite-sample multiplier n/(n−2). Its Student t reference is approximate. Missing years preserve calendar lag spacing.

HAC intervals can be narrower or wider. For Karachi during 2001–2025, conventional OLS gives a 95% interval of −0.033 to +0.265 °C/decade (p = 0.1200). HAC gives +0.007 to +0.226 °C/decade (p = 0.0382). The shared fitted slope is +0.116 °C/decade. The related windows and sampled cells are exploratory and have no multiplicity adjustment. Interactive location comparisons are descriptive. The one-time paired sensitivity check described in the limitations fits the same model to each matched Karachi-minus-site annual temperature series over 1981–2025. It uses three Newey–West lags with the finite-sample correction, then Holm-adjusts the seven p-values together.

## Reproduce

Activate a Python 3.11–3.13 virtual environment, then run from the repository root. All generation steps use the committed NASA snapshots.

```sh
python -m pip install -r requirements.txt
python -m science.generate
python -m science.region
python -m science.world --offline
python -m pytest -q
npm ci
npm run build
```

For the Giovanni consistency check, convert native T2M from kelvin to Celsius, match the 540 available calendar months to POWER and fit both series on the same 45 complete years. The matched monthly values differ by 0.0123 °C on average in absolute terms. See [the README](../README.md) for offline reproduction from the archived CSV.

## Monthly anomalies and calibration

Subtract each grid cell’s 1991–2020 mean for the corresponding calendar month from its monthly temperature. A missing observation or an incomplete 30-year baseline for that month yields a missing anomaly. The values are local to each cell.

The seeded calibration used 400 stationary Gaussian AR(1) series at each sample length, an actual slope of zero, and lag-one correlation 0.6. The initial draw uses the stationary variance. The annual lag rule and the approximate Student t reference were evaluated together. The HAC standard errors matched statsmodels with the Bartlett kernel and finite-sample correction in all 1,600 complete-series trials.

| Years | Annual lags | Conventional coverage | HAC coverage |
|---:|---:|---:|---:|
| 25 | 2 | 283/400 | 311/400 |
| 35 | 3 | 283/400 | 317/400 |
| 45 | 3 | 272/400 | 317/400 |
| 100 | 4 | 265/400 | 337/400 |

Positive residual dependence persists beyond the selected lag cutoff in this design. Bartlett weights also downweight lags inside the cutoff, and estimating the covariance after fitting a trend adds finite-sample uncertainty. The degrees-of-freedom correction and t cutoff improved the reference procedure without a guarantee of nominal coverage. The results illustrate this one simulation design.

## World Scan · NASA GISTEMP v4

World Scan uses NASA GISS Land-Ocean Temperature Index (LOTI), with NOAA ERSSTv5, 1,200 km smoothing and a nominal 2° × 2° global grid. The [official compressed NetCDF](https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz) was retrieved November 14, 2026 at 19:51:10 UTC. Its SHA-256 is `f7788db9044d0f0e3f9561ad5d0fd82e59cdfdb82ea8a10244f78f2cb032a3c7`. See the [retrieval receipt](../data/gistemp/source.v1.json) and [NASA product documentation](https://data.giss.nasa.gov/gistemp/data_v4.html).

The snapshot spans January 1880 to October 2026. The 90 × 180 grid has centers from 89° S to 89° N and 179° W to 179° E. The source provides monthly anomalies relative to 1951–1980. The signed 16-bit `tempanomaly` stores a scale factor of 0.01 and fill value 32767. xarray decodes the CF packing and standard calendar with SciPy. Differences in kelvin and degrees Celsius have the same magnitude.

The analysis uses January 1981 to December 2025. Each annual anomaly requires all 12 months weighted by calendar days. OLS uses an intercept and elapsed calendar decades on at least 40 complete years. The result is 15,875 analyzed cells, including 15,809 with all 45 complete years. The other 325 nominal grid cells have too few complete years for a mapped slope. The downloadable cell record includes the actual valid years, annual anomalies and slope. The map encodes slopes at 0.0001 °C/decade resolution.

As a sanity check, the cosine-latitude-weighted diagnostic annual series across available grid cells had a correlation of 0.99983 with NASA's separate [published global LOTI table](https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts%2BdSST.csv). Their 1981–2025 fitted slopes were +0.2152 and +0.2124 °C/decade respectively. The diagnostic uses its own explicit averaging and missing-cell treatment. NASA's published table remains the reference for the official global series.

Smoothing makes neighboring cells spatially dependent. The nominal grid spacing does not measure local precision. World Scan shows descriptive slopes and omits cell-level confidence intervals and significance tests. It does not attribute causes. NASA POWER's MERRA-2-derived 2-meter air temperature and the Karachi Giovanni comparison remain in Local Investigations, with their own data and interpretation.

Reproduce with `python -m science.gistemp`. The archived originals are in `data/gistemp/`. The browser uses versioned artifacts in `public/world-scan/v1/` and downloads only the necessary latitude rows.

### Global GISTEMP comparison

The Global Evidence Lab restricts both grid cells to the same complete calendar years within the chosen window. It shows both annual anomaly series relative to NASA’s 1951–1980 baseline and estimates separate descriptive ordinary least-squares slopes in °C per decade. A slope is displayed when at least 80% of the window’s calendar years are complete for both cells. Smoothing introduces spatial dependence, and the comparison reports no significance test for slope differences. The precomputed NASA POWER Local Evidence Lab uses a separate dataset and retains its local uncertainty analyses.

## Guided verdict and held-out coverage audit

The verdict reports the selected NASA product, source URL, measurement, period, valid years, slope, checked evidence, and limitations. The rules are deterministic. A change in fitted direction across the supported windows or a disagreement on zero between the two selected nominal intervals is reported as sensitivity. If both selected intervals include zero, the result is inconclusive. If both exclude zero in the fitted direction, the verdict describes their conditional agreement. Without two available selected intervals, the statistical strength is unassessed. An unsupported time window reports insufficient data. No certainty score or attribution is computed.

For a single GISTEMP cell, four windows use the public annual anomaly series and an OLS intercept plus the actual calendar-year spacing. The full window retains the 40-of-45 coverage requirement used by World Scan. Shorter windows require 80% complete years, rounded up. Small differences from the stored slope can arise because the detailed browser series is rounded to five decimal places. The annual panel displays the selected window's fit and both the report and download state the completeness rule. The map still represents the original full-window fits.

To reproduce the coverage audit and case check, run `python -m science.verdict_audit`. The [versioned verification record](../public/evidence-verification.v1.json) has seeds, scenario definitions, cutoff values, coverage counts and Monte Carlo Wilson intervals. The zero slope and 5,000 replicates per scenario allow direct false-exclusion and coverage checks. Validation uses a separate seed at 25, 35, 45 and 100 annual observations. The six training scenarios include independent Gaussian errors, negative and positive Gaussian AR(1), MA(1), and independent changing variance. Six additional validation cases cover moderate and strong positive AR(1), stronger MA(1), persistent AR(2), and heavy-tailed AR(1). Recursions use a 200-year burn-in. The existing HAC bandwidth, Bartlett weights and finite-sample adjustment were independently checked against statsmodels. Analytic translation of the slope verifies the simulated coverage calculation also applies to a fixed slope other than zero under this additive design.

The candidate cutoff is the largest empirical 95th percentile of the absolute studentized HAC slope statistic on the training scenarios for each sample length. The declared diagnostic screen required at least 93% observed coverage in every held-out scenario. This screen alone would not establish nominal 95% coverage. The candidate failed and is reported only in the audit. With 25 years and Gaussian AR(1) at 0.6, nominal HAC covered 74.06% and the candidate covered 95.46%. With 25 years and AR(2) at 0.65 and 0.25, coverage was 48.20% and 77.08%, respectively. With 45 years and the same AR(2), coverage was 48.16% and 70.20%. The simulations illustrate specific error processes rather than estimating calibration for a particular NASA cell. POWER retains explicitly nominal intervals for comparing assumptions. No new inferential claim was added for GISTEMP.

### Guided case · Karachi

This exploratory teaching example was selected after inspecting existing results. The raw archived POWER response was verified against its SHA-256 receipt. Annual values were independently assembled from twelve calendar-month values weighted by days. SciPy confirmed the slope and conventional standard error, and a direct Bartlett slope-score calculation confirmed the HAC interval to numerical precision.

| POWER period | Complete years | Slope (°C/decade) | Conventional nominal 95% interval | HAC nominal 95% interval |
|---|---:|---:|---:|---:|
| 1981–2025 | 45 | +0.114 | +0.046 to +0.182 | +0.043 to +0.185 |
| 2001–2025 | 25 | +0.116 | −0.033 to +0.265 | +0.007 to +0.226 |

Both long-window intervals exclude zero. The recent-window intervals disagree even though the fitted slopes are similar. The verdict changes under the selected period and uncertainty assumptions. The nominal intervals and the teaching example do not establish attribution, independent confirmation, or a calibrated probability of warming.
