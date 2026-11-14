import result from "../../data/results/karachi-t2m.v1.json";
import { TemperatureChart } from "../temperature-chart";

const { location, dataset, years_analyzed: years, trend, provenance, completeness } = result;
const period = `${years.start}–${years.end}`;
const slope = trend.slope_c_per_decade;

type Estimate = {
  confidence_interval: number[] | null;
  p_value: number | null;
};

function signed(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    signDisplay: "exceptZero",
  });
}

function pValue(value: number | null) {
  if (value === null) return "Unavailable";
  return value < 0.001 ? value.toExponential(2) : value.toFixed(4);
}

function interval(value: number[] | null) {
  return value ? `${signed(value[0])} to ${signed(value[1])}` : "Unavailable";
}

function includesZero(value: number[] | null) {
  return value ? value[0] <= 0 && value[1] >= 0 : null;
}

function compareIntervals(conventional: Estimate, hac: Estimate) {
  const conventionalZero = includesZero(conventional.confidence_interval);
  const hacZero = includesZero(hac.confidence_interval);
  if (conventionalZero === null || hacZero === null) {
    return "The available annual series does not support both uncertainty estimates.";
  }
  if (conventionalZero && hacZero) return "Both nominal 95% intervals include zero.";
  if (conventionalZero !== hacZero) return "Only one of the two nominal 95% intervals includes zero.";
  return "Both nominal 95% intervals exclude zero for the fitted slope.";
}

function EvidenceRow({ title, detail, estimate }: { title: string; detail: string; estimate: Estimate }) {
  return (
    <tr>
      <th scope="row">{title}<small>{detail}</small></th>
      <td className="monospace">{interval(estimate.confidence_interval)}</td>
      <td className="monospace">{pValue(estimate.p_value)}</td>
    </tr>
  );
}

export default function Home() {
  const points = result.annual_series
    .filter(({ year }) => year >= years.start && year <= years.end)
    .map((point) => ({
      ...point,
      fitted_c: trend.intercept_c + slope * (point.year - trend.reference_year) / 10,
    }));
  const direction = slope > 0 ? "Warming" : slope < 0 ? "Cooling" : "Flat";

  return (
    <>
      <header className="site-header">
        <div className="shell masthead">
          <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true" />VERDICT EARTH</a>
          <nav aria-label="Investigation sections">
            <a href="#investigation">Investigation</a>
            <a href="#methodology">Methodology <span aria-hidden="true">↘</span></a>
          </nav>
        </div>
      </header>

      <main className="shell" id="top">
        <section className="hero" aria-labelledby="location-title" id="investigation">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" />NASA Space Apps Challenge 2026</p>
            <h1 id="location-title">{location.city}<span>.</span></h1>
            <p className="subtitle">How has Karachi’s air temperature changed?</p>
            <p className="mission">Don’t just detect a trend. Test whether it survives scrutiny.</p>
          </div>
          <dl className="location-meta">
            <div><dt>Location</dt><dd>{location.country} <span>{location.latitude.toFixed(1)}° N · {location.longitude.toFixed(1)}° E</span></dd></div>
            <div><dt>Period analyzed</dt><dd>{period} <span>{result.valid_annual_observations} complete years</span></dd></div>
          </dl>
        </section>

        <section className="analysis-grid" aria-label="Temperature data and fitted trend">
          <figure className="panel chart-panel">
            <figcaption className="panel-title">
              <div><p className="eyebrow muted">NASA POWER · MERRA-2</p><h2>Annual mean air temperature</h2></div>
              <span className="unit-label">°C</span>
            </figcaption>
            <TemperatureChart points={points} />
            <div className="legend">
              <span><i className="legend-line" />Annual mean</span>
              <span><i className="legend-line legend-fit" />Linear trend</span>
            </div>
          </figure>

          <aside className="panel interpretation">
            <p className="eyebrow">Fitted temperature trend</p>
            <h2 className="slope">{signed(slope)}</h2>
            <p className="slope-unit">°C per decade</p>
            <div className="interpretation-detail">
              <p className="direction">{direction} over {period}</p>
              <p>{compareIntervals(trend.conventional, trend.hac)}</p>
              <a href="#inference">Compare the estimates <span aria-hidden="true">↘</span></a>
            </div>
          </aside>
        </section>

        <section className="panel evidence" id="inference" aria-labelledby="evidence-title">
          <div className="panel-title">
            <div>
              <p className="eyebrow muted">Statistical evidence</p>
              <h2 id="evidence-title">One slope, two uncertainty estimates</h2>
              <p>The Newey–West calculation accounts for nearby years having related residuals.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Method</th><th scope="col">Nominal 95% interval (°C/decade)</th><th scope="col">p-value</th></tr>
              </thead>
              <tbody>
                <EvidenceRow title="Conventional OLS" detail="Independent, constant-variance errors" estimate={trend.conventional} />
                <EvidenceRow title="Newey–West HAC" detail={`Allows short-range dependence · ${trend.hac.max_lag_years}-year lag`} estimate={trend.hac} />
              </tbody>
            </table>
          <p>Nominal intervals can under-cover, especially with autocorrelated annual errors. <a href="/#calibration-audit">Read the synthetic coverage audit ↗</a></p>
          </div>
        </section>

        <section className="methods" id="methodology" aria-labelledby="methodology-title">
          <div>
            <p className="eyebrow muted">Source &amp; methodology</p>
            <h2 id="methodology-title">How the estimate was made</h2>
            <p>{provenance.attribution} T2M represents {dataset.description} in a gridded reanalysis.</p>
            <ul>
              <li>Annual means weight each valid monthly mean by its calendar days. Each year requires all 12 months.</li>
              <li>Ordinary least squares fits temperature against calendar time. Both two-sided tests use a Student t reference.</li>
              <li>Newey–West uses Bartlett weights, {trend.hac.max_lag_years} annual lags and a finite-sample covariance correction.</li>
            </ul>
            <h3>Limits of the comparison</h3>
            <ul>{result.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
          </div>
          <aside className="panel source-panel">
            <h3>NASA data record</h3>
            <dl>
              <div><dt>Monthly coverage</dt><dd>{completeness.valid_months} / {completeness.requested_months}</dd></div>
              <div><dt>Complete years</dt><dd>{completeness.complete_calendar_years}</dd></div>
              <div><dt>NASA reported dates</dt><dd>{provenance.header.start.slice(0, 4)}–{provenance.header.end.slice(0, 4)}</dd></div>
              <div><dt>Retrieved (UTC)</dt><dd><time dateTime={provenance.retrieved_at_utc}>{provenance.retrieved_at_utc.slice(0, 10)}</time></dd></div>
              <div><dt>POWER API</dt><dd>{provenance.header.api.version}</dd></div>
            </dl>
            <a href={provenance.source_url}>NASA POWER response ↗</a>
            <a href={provenance.documentation_url}>Monthly API documentation ↗</a>
            <a href={provenance.source_documentation_url}>MERRA-2 provenance ↗</a>
            <details>
              <summary>Annual temperature values</summary>
              <ul className="data-list">
                {result.annual_series.map(({ year, temperature_c }) => (
                  <li key={year}><span>{year}</span><span>{temperature_c === null ? "Unavailable" : `${temperature_c.toFixed(2)} °C`}</span></li>
                ))}
              </ul>
            </details>
          </aside>
        </section>
      </main>
      <footer className="shell footer"><span>Verdict Earth</span><span>Sahiwal Virtual · Pakistan</span></footer>
    </>
  );
}
