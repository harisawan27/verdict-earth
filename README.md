# Verdict Earth

**Don’t just detect a trend. Test whether it survives scrutiny.**

NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective! · Sahiwal Virtual, Pakistan

Verdict Earth is a temperature-trend investigation tool. It maps NASA GISTEMP v4 surface temperature anomalies, fits local air temperature records from NASA POWER, and shows how conclusions depend on the period and the evidence available. Its default analysis period is **1981–2025**. POWER supports worldwide point lookup by place name or coordinates, subject to NASA response availability and record completeness.

[Open Verdict Earth](https://verdict-earth.vercel.app/) · [GitHub repository](https://github.com/harisawan27/verdict-earth)

## A three-minute walkthrough

1. **Explore a global pattern.** Open **Explore Earth → Global · GISTEMP** and search for a place or pick a grid cell. The place marker and the center of the smoothed 2° cell are separate. Pin a second cell to compare annual anomalies and fitted rates on common years.
2. **Investigate a local record.** Switch to **Local · POWER** and search for **Istanbul**. Choose the result to request NASA’s monthly 2-meter air temperatures. Use latitude and longitude for a point outside the Natural Earth place index. To work without contacting NASA, choose an archived sample such as **Karachi**. Add a second point to overlay annual temperatures.
3. **Change the evidence.** Open **Evidence Lab** and switch between **1981–2025** and **2001–2025**. Read the slope under **Trend**, compare conventional and Newey–West intervals under **Uncertainty**, and inspect the fitted rates under **Sensitivity**. The **Anomalies** view compares each month with that location’s 1991–2020 normal for the same month.
4. **Trace the verdict.** Open **Case Studies → Karachi** for a reproducible example. The two periods give similar warming estimates (+0.114 and +0.116 °C per decade, rounded), while the recent interval interpretation depends on the uncertainty method. Open **Methods & Sources** for input URLs, receipts and the coverage audit. Use the export action in **Verdict** to take the selected results with you.

## Which dataset answers which question?

| Workspace | NASA input | What the app reports |
| --- | --- | --- |
| Global · GISTEMP | GISTEMP v4 LOTI surface temperature anomalies relative to 1951–1980 on a smoothed 2° grid | Descriptive fits in °C per decade for 15,875 of 16,200 grid cells over 1981–2025. Mapped cells have at least 40 complete years. For a two-cell comparison, both fits use the same complete years when at least 80% of the selected period is shared. |
| Local · POWER | MERRA-2 gridded 2-meter air temperature in °C on the native 0.5° latitude × 0.625° longitude grid | Day-weighted annual means, OLS slopes, nominal conventional and HAC intervals, monthly anomalies and comparisons. Request historical series worldwide by place or coordinates. Archived map samples provide a fallback. |
| Methods & Sources · Giovanni | A NASA GES DISC Giovanni export and NASA POWER at the same matched MERRA-2 cell near Karachi | A consistency check using 540 matched months and 45 shared complete years. The guided Karachi case separately compares two POWER fits. |

[Official NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/) · [NASA GISTEMP downloads](https://data.giss.nasa.gov/gistemp/data_v4.html) · [NASA POWER monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/)

## Technology stack

The application uses Next.js, React, TypeScript, and Tailwind CSS. The Python reproducibility pipeline uses NumPy, pandas, SciPy, statsmodels, and xarray.

## Run locally

Use Node.js 22.18 or newer for the app and JavaScript tests. Python 3.11–3.13 is for scientific tests and snapshot regeneration.

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

Vercel builds this as a standard Next.js app with a Node.js route at `/api/power`. Python regenerates the checked-in scientific artifacts. The browser loads the maps, place search, cases and archived results from the app. New points require a network connection from the app server to NASA POWER.

Run `node --test tests/*.test.mjs` and `npm run typecheck` to check the TypeScript analysis, navigation and map helpers. The test command requires Node.js 22.18 or newer.

For a local production preview, run `npm run build` followed by `npm run start`. Archived results, on-demand POWER lookup, and app exports require no NASA sign-in. A fresh Giovanni export requires an Earthdata sign-in.

## Data and provenance

The archived Karachi baseline uses the [NASA POWER Monthly and Annual Point API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/), community `SB`, parameter `T2M`, requested years 1981–2025. The raw response and its retrieval receipt are in `data/raw/`. The receipt records the exact request URL, UTC retrieval timestamp, and SHA-256 of the original bytes. The analysis record is `data/results/karachi-t2m.v1.json`.

The NASA response reports coverage from January 1, 1981 to December 31, 2025, units `C`, time standard `LST`, and missing-value sentinel `-999`. It contains 540 valid monthly means over 45 complete years. The API’s 45 keys ending in `13` are separate annual summaries and the pipeline derives its own annual means from keys ending in `01` through `12`.

**Attribution.** NASA Langley Research Center POWER Project, using [NASA GMAO MERRA-2](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/). T2M is a gridded atmospheric reanalysis estimate. The coastal grid footprint can blend land and sea.

**NASA GES DISC Giovanni.** The Karachi comparison incorporates an original Giovanni export. The [data-source notes](submission/DATA_SOURCES.md) include the exact query and provenance.

If the point service becomes unavailable, the [NASA POWER archive on AWS](https://registry.opendata.aws/nasa-power/) is a documented distribution alternative. Validate its spatial selection, native units, conversion, and overlap against the point response before integrating it.

## How on-demand POWER works

- Search uses a bundled Natural Earth index of named places, including cities, regions, countries and marine areas. Country and regional results use representative points. Coordinates support geographic points outside the index. The server rounds request coordinates to four decimal places. NASA reports returned coordinates separately, typically to three decimal places.
- The server requests monthly `T2M` from NASA POWER for 1981–2025 and validates the response type, returned point, NASA source, unit and coverage before fitting. A record needs at least five complete years. A missing or partial month excludes that calendar year, and a window with fewer than five complete years is omitted. A monthly anomaly requires all 30 values for that calendar month in 1991–2020.
- A timeout, upstream error, or unusable record shows a message. Previously loaded results and the archived samples stay available. The response checksum identifies the NASA bytes used for that analysis. On-demand exports record the URL, retrieval time, coverage, unit, returned point and checksum. Upstream revisions can change the data returned later.
- The app infers candidate native grid centers for on-demand points from nominal grid spacing. Two nearby coordinates can sample the same grid cell. Annual overlays show both series. The app reports matched-window slopes together only when their valid-year lists agree, and it provides no test of the difference.

### Repository structure

| Path | Contents |
| --- | --- |
| `app/` | Next.js workspaces, analysis tools, charts and the POWER point route |
| `science/` | Python validation, snapshot generation and statistical reference implementation |
| `data/raw/` and `data/results/` | Original NASA snapshots, receipts and generated archived records |
| `public/world-scan/` | Versioned GISTEMP cell records and Natural Earth geography |
| `tests/` | Python scientific tests and Node.js regression checks, including parity for on-demand POWER |
| `submission/` | Scientific methodology, limitations, and source credits |

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

NASA Langley Research Center POWER Project and NASA GMAO MERRA-2 provide the temperature inputs. NASA GES DISC operates Giovanni. Pakistan Meteorological Department supplies regional location references. OpenAI Codex assisted with implementation, testing, and documentation. Temperature values trace to NASA responses. Synthetic series are used in tests and in the separately labeled interval coverage audit. See [data sources and credits](submission/DATA_SOURCES.md) and [NASA POWER’s citation guidance](https://power.larc.nasa.gov/docs/referencing/).

## Application workspace

Open Overview, Explore Earth, Evidence Lab, Case Studies, or Methods & Sources from the workspace navigation. The evidence tabs use shareable URLs, for example `#evidence/gistemp/sensitivity` and `#evidence/power/verdict`. The older section links, `/sindh`, and `/karachi-baseline` still work. Each dataset retains its own selected point and period during navigation.

## Guided scientific verdicts

Select a GISTEMP cell or a POWER location and choose a period. The report identifies which checks were used, links the numerical evidence, and exports the data, source, calculation and limitations as JSON. The guided Karachi case shows how changing the period changes the interval-based interpretation even with a similar fitted rate. Run `python -m science.verdict_audit` to regenerate the seeded audit and case verification. The simulated alternative failed the held-out coverage screen and is not used for inference.

## Archived POWER atlas

The world artifact is `data/results/world-t2m.v1.json`. Run `python -m science.world --offline` to rebuild from verified local snapshots or omit `--offline` to fetch missing snapshots. The versioned archive contains 31 reproducible fallback records across six continents. All have 540 valid monthly means from January 1981 through December 2025. Coordinates were cross-checked with the [GeoNames populated-place dataset](https://download.geonames.org/export/dump/) except the original Karachi reference. The map uses land outlines derived from [Natural Earth via world-atlas 2.0.2](https://github.com/topojson/world-atlas). Only markers encode trends. Karachi has a verified native cell. The other archived centers and on-demand candidates are inferred from nominal grid spacing. Monthly anomalies use the same month’s complete 1991–2020 average at the same grid cell.

## World Scan

World Scan’s versioned snapshot uses NASA’s 1951–1980 anomaly baseline. Of the 15,875 cells meeting the 40-year threshold, 15,809 have all 45 complete years. The remaining 325 of the 16,200 total cells have no mapped slope. Shorter single-cell fits require at least 80% complete years, rounded up. Run `python -m science.gistemp` to regenerate the map and its cell records. The pipeline validates the archived NetCDF and NASA global table against their retrieval receipts. See [GISTEMP source and methods](submission/SCIENTIFIC_METHODOLOGY.md#world-scan--nasa-gistemp-v4).

### World Scan geography

World Scan adds Natural Earth country and territory borders, zoom-dependent regional and city labels, and a local search index. The selected point, nearby place and NASA cell center are displayed separately. Offshore selections use marine areas where available. Labels and de facto boundaries are geographic context. See [data sources](submission/DATA_SOURCES.md).

Use `node --test tests/scan-geography.test.mjs` (Node.js 22.18 or newer) to check geographic resolution. To rebuild the versioned overlays, install `pyshp==2.3.1` and `shapely==2.1.2` and run `python -m science.geography`. The checked-in geographic assets are served locally, with no runtime geocoder.

## License

VERDICT EARTH's original source code is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

NASA datasets, geographic reference data, and third-party dependencies remain subject to their respective terms and attribution requirements.
