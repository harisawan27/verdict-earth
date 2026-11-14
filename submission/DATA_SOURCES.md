# Data sources and credits

- **NASA Langley Research Center POWER Project.** The Monthly and Annual API (v2.10.0, accessed 2026-11-14 UTC) supplies the monthly T2M series used in all eight investigations. The regional endpoint supplies the 2023 native-grid check. Original NASA files and the companion URL, retrieval time, and SHA-256 receipts are stored in [data/raw](../data/raw). [Monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/) · [Meteorology data sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/).
- **NASA Global Modeling and Assimilation Office MERRA-2.** Underlying gridded atmospheric reanalysis. [MERRA-2 documentation](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/).
- **Pakistan Meteorological Department, Regional Meteorological Centre Sindh.** Geographic reference for seven of the request coordinates. The temperatures in the app come from NASA POWER. [PMD Sindh network](https://rmcsindh.pmd.gov.pk/Network.html).

## Challenge resource use

NASA GES DISC Giovanni is listed in the [official challenge Resources tab](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources). Verdict Earth uses its Area-Averaged Time Series export of monthly **MERRA-2 M2TMNXSLV v5.12.4 T2M** to compare against POWER at the same native Karachi cell (25° N, 66.875° E) for 1981–2025. [Dataset DOI](https://doi.org/10.5067/AP1B0BA5PD2K) · [Exact Giovanni query](https://giovanni.gsfc.nasa.gov/giovanni/#service=ArAvTs&starttime=1981-01-01T00:00:00Z&endtime=2025-12-31T23:59:59Z&bbox=66.81,24.94,66.94,25.06&data=M2TMNXSLV_5_12_4_T2M&portal=GIOVANNI&format=json).

The classic Giovanni CSV was downloaded on 2026-11-14 UTC. Its [unedited bytes](../data/raw/giovanni-karachi-1981-01--2025-12-ae3dccd6669e.csv) and [comparison record](../data/results/giovanni-karachi.v1.json) preserve the query, bounds and SHA-256 checksum. NASA documents native T2M in kelvin. We subtract 273.15 to obtain degrees Celsius and compare the 540 matching months and 45 shared complete calendar years.

This is a consistency check within MERRA-2. Differences can arise from monthly processing, time standards, and rounding. The incorporation supports the listed-resource requirement. The organizers determine final eligibility. [Global Organizing Team guidance](https://github.com/nasa/spaceapps/discussions/1827).
