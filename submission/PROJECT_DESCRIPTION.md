# Verdict Earth

**Don't just detect a trend. Test whether it survives scrutiny.**

A rising line can look persuasive even when its uncertainty depends on the years selected or on how the analysis handles related observations. Verdict Earth makes those choices visible. It lets students, educators, and people exploring local climate records see how much an environmental trend changes as they test different assumptions.

World Scan maps fitted trends for 15,875 NASA GISTEMP v4 LOTI grid cells with 1981–2025 data. Users can search for a place, select a cell on a labeled map, inspect its annual anomalies relative to 1951–1980 and download the analyzed series. Local · POWER uses NASA’s MERRA-2 reanalysis estimates of monthly 2-meter air temperature. Search for a place or enter coordinates to request a point from NASA POWER. The app also includes 31 archived samples across six continents and a separate eight-location Sindh case study. In Evidence Lab, switch time windows, compare conventional and Newey–West uncertainty around the same fitted slope, and explore monthly anomalies relative to 1991–2020. Overlay a second location’s annual temperatures and compare slopes on matching valid years. Methods & Sources shows NASA records, grid metadata, and methods. Analysis exports are available as JSON.

The Global Evidence Stress Test fits four supported time windows for any GISTEMP cell. A guided, deterministic verdict separates the NASA data, trend, assumptions, sensitivity and limitations. Each report links its calculations and can be downloaded as JSON. POWER’s intervals are nominal. The released simulation audit shows where their empirical coverage falls short.

For Karachi in 2001–2025, the fitted warming rate is +0.116 °C per decade. The conventional nominal 95% confidence interval includes zero and the Newey–West interval excludes it. The fitted line is the same in both cases. The difference lies in how uncertainty is estimated.

The hackathon work includes the NASA retrieval and validation pipeline, the worldwide atlas, regional case study, the stress test, and reproducible exports. The investigation uses NASA POWER and a NASA Giovanni export to compare results for Karachi over 45 shared years. See [Data sources and credits](DATA_SOURCES.md). Verdict Earth is a participant project.
