# Verdict Earth

**Don’t just detect a trend. Test whether it survives scrutiny.**

NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective! · Sahiwal Virtual, Pakistan

Verdict Earth investigates annual 2-meter air temperature at eight locations across Sindh, Pakistan. The Evidence Stress Test covers four historical windows and two uncertainty methods. Next.js reads versioned scientific results offline. The original investigation remains at /karachi-baseline.

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
.\.venv\Scripts\python.exe -m science.region
npm run build
```

On macOS or Linux, use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`. To explicitly request fresh NASA data, run `python -m science.generate --refresh` using the virtual environment’s Python. A failed request exits with an error. The existing verified snapshot remains usable for offline regeneration. Review the raw response, receipt, and regenerated result together when updating the snapshot.

Vercel can build this as a standard Next.js project using the committed JSON and lockfile. Python and the NASA API are needed only to generate or refresh the source artifacts.

## Data and provenance

The source is the [NASA POWER Monthly and Annual Point API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/), community `SB`, parameter `T2M`, requested years 1981–2025. The raw response and its retrieval receipt are in `data/raw/`. The receipt records the exact request URL, UTC retrieval timestamp, and SHA-256 of the original bytes. The analysis record is `data/results/karachi-t2m.v1.json`.

The NASA response reports coverage from January 1, 1981 to December 31, 2025, units `C`, time standard `LST`, and missing-value sentinel `-999`. It contains 540 valid monthly means over 45 complete years. The API’s 45 keys ending in `13` are separate annual summaries and the pipeline derives its own annual means from keys ending in `01` through `12`.

**Attribution.** NASA Langley Research Center POWER Project, using [NASA GMAO MERRA-2](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/). T2M is a gridded atmospheric reanalysis estimate. The coastal grid footprint can blend land and sea.

**Challenge eligibility, unconfirmed.** The official [Resources tab](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources) lists Giovanni, Hydrology Time Series, AppEEARS, Climate Data Online, and a SeaWiFS time-series article in its NASA resources section. It does not list NASA POWER or MERRA-2 by name. MERRA-2 appears in the challenge background. Treat the current POWER-only investigation as lacking confirmed Global Awards eligibility. The [Global Organizing Team guidance](https://github.com/nasa/spaceapps/discussions/1827) requires use of at least one NASA data source listed in the challenge resources. See the Giovanni instructions below for the remaining integration step.

If the point service becomes unavailable, the [NASA POWER archive on AWS](https://registry.opendata.aws/nasa-power/) is a documented distribution alternative. Validate its spatial selection, native units, conversion, and overlap against the point response before integrating it.

## Statistical methods

Each annual mean is weighted by the number of days in each month, including leap days. Years with an absent, partial, or fill-value month are excluded. Ordinary least squares regresses annual temperature on elapsed calendar decades with an intercept.

The two-sided conventional test uses a 95% Student t interval with `n − 2` degrees of freedom. It assumes independent, constant-variance errors. The Newey–West HAC estimate uses Bartlett weights, a maximum lag of `floor(4 × (n/100)^(2/9))` calendar years, and the finite-sample covariance multiplier `n/(n−2)`. It uses the same Student t reference as an approximation. Gaps contribute no residual scores and preserve the spacing between years. The slope is shared by both estimates. Exact-fit or zero-variance cases produce an unavailable interval and p-value.

The comparison concerns linear change over the selected interval. Confidence intervals represent regression uncertainty, exclude uncertainty in the underlying reanalysis, and cannot establish cause. A fixed lag may miss dependence at longer timescales, and a linear fit can obscure shifts, extremes, and seasonal patterns.


## Regional investigation

Seven additional POWER requests use decimal coordinates from the [Pakistan Meteorological Department's Sindh network](https://rmcsindh.pmd.gov.pk/Network.html). Karachi keeps its original 24.9° N, 67.0° E request. POWER rounds the returned point location to three decimals. The meteorological grid is 0.5° latitude by 0.625° longitude.

The pipeline matches 12 monthly point temperatures to the original, checksummed 2023 POWER regional snapshot. It also checks nominal nearest grid cells, identical monthly series, and request coordinates within 0.001°. All eight sites matched distinct native cells. Nearby cells can still share weather and model errors.

Run `python -m science.region` in the Python environment to regenerate `data/results/sindh-t2m.v1.json` offline. It contains observations, grid matches, and fits for 1981–2025, 1991–2025, 2001–2025, and 1981–2015. Pass `--refresh` for new snapshots at the seven regional locations. The Karachi baseline has a separate refresh command. If NASA revises the matched 2023 values, compare the original and new regional grid snapshot and checksum before accepting new matches.

The comparison dropdown overlays another site's annual means. The interface presents matched-window slopes when the sites have the same valid years. Comparisons are descriptive. The related time windows are sensitivity checks without multiple-comparison adjustment. Statistical significance cannot establish cause.

In the seeded zero-trend AR(1) test (400 series of 100 years, lag-one correlation 0.6), the 95% intervals included the true slope in 265 conventional fits and 337 HAC fits. HAC improved coverage in this simulation and still fell short of the nominal 95%.

## Import a signed-in Giovanni export

Anonymous access checked November 14, 2026. Giovanni in the Cloud returned HTTP 403 and a missing-token message. Classic Giovanni completed a two-month visualization at 25° N, 66.875° E, the same native cell as POWER. Its CSV endpoint returned HTTP 401 and its NetCDF endpoint redirected to Earthdata Login. The unsigned 1981–2025 and five-year workflows failed during the data search. The current analysis uses POWER alone.

1. Open [Giovanni](https://giovanni.gsfc.nasa.gov/giovanni/#dataKeyword=M2TMNXSLV) and sign into NASA Earthdata in your browser. Keep credentials and tokens outside the repository.
2. Choose **Time Series → Area-Averaged**. Search **M2TMNXSLV** and select **2-meter air temperature, monthly, M2TMNXSLV v5.12.4** (`M2TMNXSLV_5_12_4_T2M`, normally kelvin). [NASA product DOI](https://doi.org/10.5067/AP1B0BA5PD2K).
3. Enter **1981-01-01 to 2025-12-31** and bounds **66.81, 24.94, 66.94, 25.06** in west, south, east, north order. Click **Plot Data**. Confirm the result caption identifies a single point at 66.875° E, 25° N. If the large signed-in job fails, retry in non-overlapping calendar-year batches.
4. Under **Downloads**, save the original **CSV** file for each successful batch. Keep its headers and bytes intact.
5. Run the import with the actual UTC download date and the CSV units. Replace the date and path in this example.

```powershell
.\.venv\Scripts\python.exe -m science.giovanni --retrieved-date YYYY-MM-DD --units K "C:\path\to\original.csv"
```

Pass multiple CSV paths if you used batches. The importer checks the dataset, variable, dates, and unit consistency, converts kelvin to Celsius, preserves the original files with SHA-256 checksums, and writes `data/results/giovanni-karachi.v1.json`. Trend comparison requires at least five common complete calendar years. Rebuild the app to display the comparison. The importer has fixture coverage. A signed-in export remains untested in this environment.

This compares two products derived from MERRA-2. Spatial sampling, time basis, monthly averaging, rounding, and processing can affect agreement.

## Attribution and AI use

NASA Langley Research Center POWER Project and NASA GMAO MERRA-2 provide the temperature inputs. NASA GES DISC operates Giovanni. Pakistan Meteorological Department supplies regional location references. OpenAI Codex assisted with implementation, testing, and documentation. All production temperature values are traceable to the recorded NASA responses. Synthetic data appear only in automated tests.
