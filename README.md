# Verdict Earth

**Don’t just detect a trend. Test whether it survives scrutiny.**

NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective! · Sahiwal Virtual, Pakistan

Verdict Earth explores 45 years of NASA climate data. World Scan maps fitted surface temperature anomaly trends across 15,875 NASA GISTEMP v4 LOTI grid cells. Local Investigations uses NASA POWER 2-meter air temperature at 31 sampled locations across six continents. The atlas combines a searchable world map, annual temperature series, monthly local anomalies, matched-year location comparisons, and an Evidence Lab for four historical windows and two uncertainty methods. The eight-location regional case study is at `/sindh` and the original baseline is at `/karachi-baseline`.

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
.\.venv\Scripts\python.exe -m science.world --offline
npm run build
```

On macOS or Linux, use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`. To explicitly request fresh NASA data, run `python -m science.generate --refresh` using the virtual environment’s Python. A failed request exits with an error. The existing verified snapshot remains usable for offline regeneration. Review the raw response, receipt, and regenerated result together when updating the snapshot.

Vercel can build this as a standard Next.js project using the committed JSON and lockfile. Python and the NASA API are needed only to generate or refresh the source artifacts.

## Release and submission

The repository is [public on GitHub](https://github.com/harisawan27/verdict-earth). The existing production domain is [verdict-earth.vercel.app](https://verdict-earth.vercel.app/). Check that the deployed release displays the worldwide atlas and the Karachi Giovanni comparison. The [submission checklist](submission/SUBMISSION_CHECKLIST.md) covers Vercel import, public-link verification, and the NASA project form. The [demo script](submission/DEMO_SCRIPT.md) includes a 30-second storyboard. For a local production preview use `npm run build` followed by `npm run start`. The production app bundles its scientific results and needs no NASA connection or sign-in for browsing, analysis, or JSON download.

## Data and provenance

The source is the [NASA POWER Monthly and Annual Point API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/), community `SB`, parameter `T2M`, requested years 1981–2025. The raw response and its retrieval receipt are in `data/raw/`. The receipt records the exact request URL, UTC retrieval timestamp, and SHA-256 of the original bytes. The analysis record is `data/results/karachi-t2m.v1.json`.

The NASA response reports coverage from January 1, 1981 to December 31, 2025, units `C`, time standard `LST`, and missing-value sentinel `-999`. It contains 540 valid monthly means over 45 complete years. The API’s 45 keys ending in `13` are separate annual summaries and the pipeline derives its own annual means from keys ending in `01` through `12`.

**Attribution.** NASA Langley Research Center POWER Project, using [NASA GMAO MERRA-2](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/). T2M is a gridded atmospheric reanalysis estimate. The coastal grid footprint can blend land and sea.

**Challenge resource use.** The Karachi comparison incorporates an original NASA GES DISC Giovanni export. Giovanni is listed in the [official Resources tab](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources). This supports the resource requirement. The organizers determine final eligibility. [Global Organizing Team guidance](https://github.com/nasa/spaceapps/discussions/1827).

If the point service becomes unavailable, the [NASA POWER archive on AWS](https://registry.opendata.aws/nasa-power/) is a documented distribution alternative. Validate its spatial selection, native units, conversion, and overlap against the point response before integrating it.

## Statistical methods

Each annual mean is weighted by the number of days in each month, including leap days. Years with an absent, partial, or fill-value month are excluded. Ordinary least squares regresses annual temperature on elapsed calendar decades with an intercept.

The two-sided conventional test uses a 95% Student t interval with `n − 2` degrees of freedom. It assumes independent, constant-variance errors. The Newey–West HAC estimate uses Bartlett weights, a maximum lag of `floor(4 × (n/100)^(2/9))` calendar years, and the finite-sample covariance multiplier `n/(n−2)`. It uses the same Student t reference as an approximation. Gaps contribute no residual scores and preserve the spacing between years. The slope is shared by both estimates. HAC can produce a narrower or wider interval than conventional OLS. Exact-fit or zero-variance cases produce an unavailable interval and p-value.

The comparison concerns linear change over the selected interval. Confidence intervals represent regression uncertainty, exclude uncertainty in the underlying reanalysis, and cannot establish cause. A fixed lag may miss dependence at longer timescales, and a linear fit can obscure shifts, extremes, and seasonal patterns.


## Regional investigation

Seven additional POWER requests use decimal coordinates from the [Pakistan Meteorological Department's Sindh network](https://rmcsindh.pmd.gov.pk/Network.html). Karachi keeps its original 24.9° N, 67.0° E request. POWER rounds the returned point location to three decimals. The meteorological grid is 0.5° latitude by 0.625° longitude.

The pipeline matches 12 monthly point temperatures to the original, checksummed 2023 POWER regional snapshot. It also checks nominal nearest grid cells, identical monthly series, and request coordinates within 0.001°. All eight sites matched distinct native cells. Nearby cells can still share weather and model errors.

Run `python -m science.region` in the Python environment to regenerate `data/results/sindh-t2m.v1.json` offline. It contains observations, grid matches, and fits for 1981–2025, 1991–2025, 2001–2025, and 1981–2015. Pass `--refresh` for new snapshots at the seven regional locations. The Karachi baseline has a separate refresh command. If NASA revises the matched 2023 values, compare the original and new regional grid snapshot and checksum before accepting new matches.

The comparison dropdown overlays another site's annual means. The interface presents matched-window slopes when the sites have the same valid years. Comparisons are descriptive. The eight sites and four related time windows are exploratory sensitivity checks without multiple-comparison adjustment. Statistical significance cannot establish cause.

In the seeded zero-trend AR(1) test (400 series of 100 years, lag-one correlation 0.6), the 95% intervals included the true slope in 265 conventional fits and 337 HAC fits. HAC improved coverage in this simulation and still fell short of the nominal 95%. A follow-up audit using the same seeded stationary AR(1) design found HAC coverage of 311, 317, and 317 of 400 for 25, 35, and 45 years respectively. The estimator agreed with statsmodels in every complete-series run. See [Scientific methodology](submission/SCIENTIFIC_METHODOLOGY.md).

## Import a signed-in Giovanni export

The committed export covers 540 months and 45 complete years (1981–2025) at 25° N, 66.875° E. The fitted Giovanni and POWER slopes are +0.11437 and +0.11410 °C per decade. The mean absolute difference in the matched monthly values is 0.0123 °C. See [source and provenance](submission/DATA_SOURCES.md). The signed-in steps below are needed only to obtain a fresh export.

1. Open [Giovanni](https://giovanni.gsfc.nasa.gov/giovanni/#dataKeyword=M2TMNXSLV) and sign into NASA Earthdata in your browser. Keep credentials and tokens outside the repository.
2. Choose **Time Series → Area-Averaged**. Search **M2TMNXSLV** and select **2-meter air temperature, monthly, M2TMNXSLV v5.12.4** (`M2TMNXSLV_5_12_4_T2M`, normally kelvin). [NASA product DOI](https://doi.org/10.5067/AP1B0BA5PD2K).
3. Enter **1981-01-01 to 2025-12-31** and bounds **66.81, 24.94, 66.94, 25.06** in west, south, east, north order. Click **Plot Data**. Confirm the result caption identifies a single point at 66.875° E, 25° N. If the large signed-in job fails, retry in non-overlapping calendar-year batches.
4. Under **Downloads**, save the original **CSV** file for each successful batch in the ignored local folder `data/incoming/`. Keep its headers and bytes intact.
5. Run the import with the actual UTC download date and the CSV units. Replace the date and path in this example.

```powershell
.\.venv\Scripts\python.exe -m science.giovanni --retrieved-date YYYY-MM-DD --units K "C:\path\to\original.csv"
```

Pass multiple CSV paths if you used batches. The importer checks the dataset, variable, dates, and unit consistency, converts kelvin to Celsius, preserves the original files with SHA-256 checksums, and writes `data/results/giovanni-karachi.v1.json`. Trend comparison requires at least five common complete calendar years. Rebuild the app to display the comparison. The archived original can reproduce the comparison offline with the command below.

From the repository root with your Python environment active:

```sh
python -m science.giovanni --retrieved-date 2026-11-14 --units K data/raw/giovanni-karachi-1981-01--2025-12-ae3dccd6669e.csv
```

This compares two products derived from MERRA-2. Spatial sampling, time basis, monthly averaging, rounding, and processing can affect agreement.

## Attribution and AI use

NASA Langley Research Center POWER Project and NASA GMAO MERRA-2 provide the temperature inputs. NASA GES DISC operates Giovanni. Pakistan Meteorological Department supplies regional location references. OpenAI Codex assisted with implementation, testing, and documentation. All production temperature values are traceable to the recorded NASA responses. Synthetic data appear only in automated tests.

## License and third-party rights

This repository currently has no project-wide software license grant. Dependencies retain their respective licenses. See [data sources and credits](submission/DATA_SOURCES.md) for NASA and PMD materials and [NASA POWER’s citation guidance](https://power.larc.nasa.gov/docs/referencing/) for source acknowledgment.

### Worldwide atlas

The world artifact is `data/results/world-t2m.v1.json`. Run `python -m science.world --offline` to rebuild from verified local snapshots or omit `--offline` to fetch missing snapshots. The atlas uses 31 NASA POWER grid-point records for January 1981 to December 2025, all complete. Coordinates were cross-checked with the [GeoNames populated-place dataset](https://download.geonames.org/export/dump/) except the original Karachi reference. The map uses land outlines derived from [Natural Earth via world-atlas 2.0.2](https://github.com/topojson/world-atlas). Only markers encode trends. Karachi has a verified native cell. Other worldwide grid centers are inferred from the nominal grid spacing. Monthly anomalies use the same month’s complete 1991–2020 average at the same grid cell.

### World Scan

Run `python -m science.gistemp` to regenerate the offline map and cell records. The pipeline validates the archived NetCDF and NASA global table against their retrieval receipts. See [GISTEMP source and methods](submission/SCIENTIFIC_METHODOLOGY.md#world-scan--nasa-gistemp-v4).
