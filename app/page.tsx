import scan from "../public/world-scan/v1/manifest.json";
import data from "../data/results/world-t2m.v1.json";
import { Investigation } from "./investigation";

const continents = new Set(data.stations.map(site => site.continent)).size;
const years = Math.min(...data.stations.map(site => site.completeness.complete_calendar_years));

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#top">Skip to investigation</a>
      <header className="site-header">
        <div className="shell masthead">
          <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true" />VERDICT EARTH</a>
          <nav aria-label="Investigation sections">
            <a href="#region">Explore Earth</a>
            <a href="#stress-test">Local lab</a>
            <a href="#featured">Featured investigations</a>
            <a href="#how-we-know">How We Know</a>
          </nav>
        </div>
      </header>
      <main className="shell atlas" id="top" tabIndex={-1}>
        <section className="regional-hero atlas-hero">
          <div>
            <p className="eyebrow"><span className="status-dot" />NASA Space Apps Challenge 2026</p>
            <h1>The Planet Under<br className="hero-break" /> Investigation<span>.</span></h1>
            <p className="hero-mission">{years} years of NASA climate data. Explore temperature change around the world and test how much confidence the evidence deserves.</p>
            <div className="hero-actions">
              <a className="primary-action" href="#region">Explore Earth <span aria-hidden="true">↓</span></a>
              <a className="secondary-action" href="#global-evidence">Compare places</a>
            </div>
          </div>
          <dl className="atlas-facts">
            <div><dt>Global GISTEMP cells</dt><dd>{scan.valid_cells.toLocaleString("en-US")}</dd></div>
            <div><dt>Local POWER investigations</dt><dd>{data.stations.length} across {continents} continents</dd></div>
            <div><dt>Analysis period</dt><dd>{data.requested_years.start}–{data.requested_years.end}</dd></div>
            <div><dt>Dataset</dt><dd>NASA GISTEMP · NASA POWER</dd></div>
          </dl>
        </section>
        <Investigation data={data} worldwide />
      </main>
      <footer className="shell footer">
        <a href="/sindh">Sindh regional investigation ↗</a>
        <a href="/karachi-baseline">Karachi baseline investigation ↗</a>
        <span>Sahiwal Virtual · Pakistan</span>
      </footer>
    </>
  );
}
