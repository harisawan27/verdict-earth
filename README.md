# Verdict Earth

**Don’t just detect a trend. Test whether it survives scrutiny.**

NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective! · Sahiwal Virtual, Pakistan

Verdict Earth investigates how annual 2-meter air temperature changed around Karachi (24.9° N, 67.0° E). The Next.js app renders a local, versioned result produced by Python and has no runtime data-service dependency.

## Run locally

Use Node.js 22 or newer and Python 3.11–3.13. With the checked-in result, the app only needs Node.js:

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To test and regenerate the result with the checked-in NASA snapshot, run the following in Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m science.generate
npm run build
```

On macOS or Linux, use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`. To explicitly request fresh NASA data, run `python -m science.generate --refresh` using the virtual environment’s Python. A failed request exits with an error. The existing verified snapshot remains usable for offline regeneration. Review the raw response, receipt, and regenerated result together when updating the snapshot.

Vercel can build this as a standard Next.js project using the committed JSON and lockfile. Python and the NASA API are needed only to generate or refresh the source artifacts.

## Data and provenance

The source is the [NASA POWER Monthly and Annual Point API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/), community `SB`, parameter `T2M`, requested years 1981–2025. The raw response and its retrieval receipt are in `data/raw/`. The receipt records the exact request URL, UTC retrieval timestamp, and SHA-256 of the original bytes. The analysis record is `data/results/karachi-t2m.v1.json`.

The NASA response reports coverage from January 1, 1981 to December 31, 2025, units `C`, time standard `LST`, and missing-value sentinel `-999`. It contains 540 valid monthly means over 45 complete years. The API’s 45 keys ending in `13` are separate annual summaries and the pipeline derives its own annual means from keys ending in `01` through `12`.

**Attribution.** NASA Langley Research Center POWER Project, using [NASA GMAO MERRA-2](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/). T2M is a gridded atmospheric reanalysis estimate. The coastal grid footprint can blend land and sea.

**Challenge eligibility.** The official [Resources tab](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources) lists Giovanni, Hydrology Time Series, AppEEARS, Climate Data Online, and a SeaWiFS time-series article in its NASA resources section. It does not list NASA POWER or MERRA-2 by name. MERRA-2 appears in the challenge background. Treat the current POWER-only investigation as lacking confirmed Global Awards eligibility. The [Global Organizing Team guidance](https://github.com/nasa/spaceapps/discussions/1827) requires use of at least one NASA data source listed in the challenge resources. The next implementation milestone should use the listed Giovanni service to produce and cite a real comparison series.

If the point service becomes unavailable, the [NASA POWER archive on AWS](https://registry.opendata.aws/nasa-power/) is a documented distribution alternative. Validate its spatial selection, native units, conversion, and overlap against the point response before integrating it.

## Statistical methods

Each annual mean is weighted by the number of days in each month, including leap days. Years with an absent, partial, or fill-value month are excluded. Ordinary least squares regresses annual temperature on elapsed calendar decades with an intercept.

The two-sided conventional test uses a 95% Student t interval with `n − 2` degrees of freedom. It assumes independent, constant-variance errors. The Newey–West HAC estimate uses Bartlett weights, a maximum lag of `floor(4 × (n/100)^(2/9))` calendar years, and the finite-sample covariance multiplier `n/(n−2)`. It uses the same Student t reference as an approximation. Gaps contribute no residual scores and preserve the spacing between years. The slope is shared by both estimates. Exact-fit or zero-variance cases produce an unavailable interval and p-value.

The comparison concerns linear change over the selected interval. Confidence intervals represent regression uncertainty, exclude uncertainty in the underlying reanalysis, and cannot establish cause. A fixed lag may miss dependence at longer timescales, and a linear fit can obscure shifts, extremes, and seasonal patterns.
