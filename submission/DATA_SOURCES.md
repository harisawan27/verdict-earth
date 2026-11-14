# Data sources and credits

- **NASA Langley Research Center POWER Project.** The Monthly and Annual API (v2.10.0, accessed 2026-11-14 UTC) supplies the monthly T2M series used in the 31-location atlas and eight-location Sindh case study. The regional endpoint supplies the 2023 native-grid check. Original NASA files and the companion URL, retrieval time, and SHA-256 receipts are stored in [data/raw](../data/raw). [Monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/) · [Meteorology data sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/).
- **NASA Global Modeling and Assimilation Office MERRA-2.** Underlying gridded atmospheric reanalysis. [MERRA-2 documentation](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/).
- **Pakistan Meteorological Department, Regional Meteorological Centre Sindh.** Geographic reference for seven of the request coordinates. The temperatures in the app come from NASA POWER. [PMD Sindh network](https://rmcsindh.pmd.gov.pk/Network.html).

- **GeoNames.** The populated-place file supplied reference coordinates for checking atlas request points outside Karachi. [GeoNames data export](https://download.geonames.org/export/dump/).
- **Natural Earth.** The bundled 1:110m land outline provides map context. Temperature information is shown only at sampled locations. [World Atlas 2.0.2](https://github.com/topojson/world-atlas).

## Challenge resource use

NASA GES DISC Giovanni is listed in the [official challenge Resources tab](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources). Verdict Earth uses its Area-Averaged Time Series export of monthly **MERRA-2 M2TMNXSLV v5.12.4 T2M** to compare against POWER at the same native Karachi cell (25° N, 66.875° E) for 1981–2025. [Dataset DOI](https://doi.org/10.5067/AP1B0BA5PD2K) · [Exact Giovanni query](https://giovanni.gsfc.nasa.gov/giovanni/#service=ArAvTs&starttime=1981-01-01T00:00:00Z&endtime=2025-12-31T23:59:59Z&bbox=66.81,24.94,66.94,25.06&data=M2TMNXSLV_5_12_4_T2M&portal=GIOVANNI&format=json).

The classic Giovanni CSV was downloaded on 2026-11-14 UTC. Its [unedited bytes](../data/raw/giovanni-karachi-1981-01--2025-12-ae3dccd6669e.csv) and [comparison record](../data/results/giovanni-karachi.v1.json) preserve the query, bounds and SHA-256 checksum. NASA documents native T2M in kelvin. We subtract 273.15 to obtain degrees Celsius and compare the 540 matching months and 45 shared complete calendar years.

This is a consistency check within MERRA-2. Differences can arise from monthly processing, time standards, and rounding. The incorporation supports the listed-resource requirement. The organizers determine final eligibility. [Global Organizing Team guidance](https://github.com/nasa/spaceapps/discussions/1827).

## World Scan

- **NASA Goddard Institute for Space Studies.** GISTEMP v4 Land-Ocean Temperature Index (LOTI), ERSSTv5, 1,200 km smoothing, 2° × 2° nominal grid, baseline 1951–1980. [NASA Data Downloads](https://data.giss.nasa.gov/gistemp/data_v4.html) · [Archived file receipt](../data/gistemp/source.v1.json). This data source is separate from POWER and from the Karachi Giovanni comparison.
- **Natural Earth.** World Scan overlays a coastline from the same bundled land outlines for geographic context.

### World Scan geographic reference

Natural Earth public-domain WGS 84 data provide 1:50m Admin-0 polygons, international and disputed boundary lines, coastlines, populated places, marine polygons and selected Admin-1 areas. The 1:10m country layer adds coastal detail around New York, Fiji and Istanbul. The 1:10m Admin-1 layer adds selected countries, including Pakistan, Japan and the United Kingdom. The [geographic manifest](../public/world-scan/geo-v1/manifest.json) records exact archive URLs, versions and SHA-256 hashes. [Natural Earth cultural layers](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/) · [Terms of use](https://www.naturalearthdata.com/about/terms-of-use/). The boundaries depict Natural Earth’s de facto view and do not express a NASA position.
