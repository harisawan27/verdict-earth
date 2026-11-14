# Scientific methodology

## From monthly data to trends

NASA POWER delivers monthly mean 2-meter air temperature (T2M) derived from MERRA-2 in degrees Celsius. The native meteorological grid has 0.5° latitude by 0.625° longitude spacing. Eight point requests cover January 1981 through December 2025. The pipeline checks the request metadata, returned coordinates, dates, units, fill values, and original SHA-256 checksum. The 2023 regional grid export uniquely matches 12 monthly values to each of eight distinct native cells. Karachi's request at 24.9° N, 67.0° E maps to the cell centered at 25° N, 66.875° E.

A calendar year is eligible when all 12 months are valid. The mean weights each month by its calendar days, including leap days. Each study window uses ordinary least squares with an intercept and elapsed calendar decades. Windows are 1981–2025, 1991–2025, 2001–2025, and 1981–2015.

## Uncertainty and interpretation

Both methods use the same observations and estimated slope. The conventional two-sided Student t interval and p-value use n−2 degrees of freedom and assume independent, constant-variance residuals. The Newey–West heteroskedasticity and autocorrelation consistent (HAC) covariance uses Bartlett weights, floor(4 × (n/100)^(2/9)) annual lags, and the finite-sample multiplier n/(n−2). Its Student t reference is approximate. Missing years preserve calendar lag spacing.

HAC intervals can be narrower or wider. For Karachi during 2001–2025, conventional OLS gives a 95% interval of −0.033 to +0.265 °C/decade (p = 0.1200). HAC gives +0.007 to +0.226 °C/decade (p = 0.0382). The shared fitted slope is +0.116 °C/decade. The related windows and eight cells are exploratory and have no multiplicity adjustment. Interactive location comparisons are descriptive. The one-time paired sensitivity check described in the limitations fits the same model to each matched Karachi-minus-site annual temperature series over 1981–2025. It uses three Newey–West lags with the finite-sample correction, then Holm-adjusts the seven p-values together.

## Reproduce

Activate a Python 3.11–3.13 virtual environment, then run from the repository root. Both generation steps use the committed NASA snapshots.

```sh
python -m pip install -r requirements.txt
python -m science.generate
python -m science.region
python -m pytest -q
npm ci
npm run build
```

For the Giovanni consistency check, convert native T2M from kelvin to Celsius, match the 540 available calendar months to POWER and fit both series on the same 45 complete years. The matched monthly values differ by 0.0123 °C on average in absolute terms. See [the README](../README.md) for offline reproduction from the archived CSV.
