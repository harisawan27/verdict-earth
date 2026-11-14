# Verdict Earth

**Don't just detect a trend. Test whether it survives scrutiny.**

A rising line can look persuasive even when its uncertainty depends on the years selected or on how the analysis handles related observations. Verdict Earth makes those choices visible. It lets students, educators, and people exploring local climate records see how much an environmental trend changes as they test different assumptions.

We built a reproducible investigation of annual near-surface air temperature at eight locations across Sindh, Pakistan. The app uses monthly NASA POWER T2M records derived from NASA's MERRA-2 atmospheric reanalysis. Select a location on the geographic plot, then use the Evidence Stress Test to switch time windows and compare conventional and autocorrelation-aware uncertainty around the same fitted slope. A second location can be overlaid for context. How We Know exposes the underlying NASA records, native grid match, and methods, and the app exports the selected analysis as JSON.

For Karachi in 2001–2025, the fitted warming rate is +0.116 °C per decade. The conventional 95% confidence interval includes zero and the Newey–West interval excludes it. The fitted line is the same in both cases. The difference lies in how uncertainty is estimated.

The hackathon work includes the NASA retrieval and validation pipeline, the regional dashboard, the stress test, and reproducible exports. The current investigation uses NASA POWER. See [Data sources and resource status](DATA_SOURCES.md) for the separate Giovanni access status. Verdict Earth is a participant project.
