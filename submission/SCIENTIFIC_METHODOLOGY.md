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
