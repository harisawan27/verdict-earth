# Data sources and credits

- **NASA Langley Research Center POWER Project.** The Monthly and Annual API (v2.10.0, accessed 2026-11-14 UTC) supplies the monthly T2M series used in all eight investigations. The regional endpoint supplies the 2023 native-grid check. Original NASA files and the companion URL, retrieval time, and SHA-256 receipts are stored in [data/raw](../data/raw). [Monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/) · [Meteorology data sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/).
- **NASA Global Modeling and Assimilation Office MERRA-2.** Underlying gridded atmospheric reanalysis. [MERRA-2 documentation](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/).
- **Pakistan Meteorological Department, Regional Meteorological Centre Sindh.** Geographic reference for seven of the request coordinates. The temperatures in the app come from NASA POWER. [PMD Sindh network](https://rmcsindh.pmd.gov.pk/Network.html).

## Challenge resource status

NASA GES DISC Giovanni appears on the [official challenge Resources tab](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources). POWER and MERRA-2 are absent by name from that list. An anonymous classic Giovanni job completed a two-month visualization, while export required Earthdata Login. The current release contains no Giovanni measurements. Use of a listed NASA source is unresolved and the organizers determine eligibility. [Global Organizing Team guidance](https://github.com/nasa/spaceapps/discussions/1827).

The prepared comparison targets the Giovanni export of MERRA-2 monthly M2TMNXSLV v5.12.4 T2M, DOI [10.5067/AP1B0BA5PD2K](https://doi.org/10.5067/AP1B0BA5PD2K). With verified exports, comparison measures consistency within MERRA-2, subject to spatial selection, monthly processing, time conventions, and rounding.
