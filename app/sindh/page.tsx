export const metadata = { title: "Verdict Earth | Sindh Temperature Trends" };

import data from "../../data/results/sindh-t2m.v1.json";
import { Investigation } from "../investigation";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#top">Skip to investigation</a>
      <header className="site-header">
        <div className="shell masthead">
          <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true" />VERDICT EARTH</a>
          <nav aria-label="Investigation sections">
            <a href="#region">Region</a>
            <a href="#stress-test">Stress test</a>
            <a href="#how-we-know">How we know</a>
          </nav>
        </div>
      </header>
      <main className="shell" id="top" tabIndex={-1}>
        <section className="regional-hero">
          <p className="eyebrow"><span className="status-dot" />NASA Space Apps Challenge 2026</p>
          <h1>Temperature trends<br className="hero-break" /> across Sindh<span>.</span></h1>
          <p className="hero-mission">Don’t just detect a trend. Test whether it survives scrutiny.</p>
          <div className="hero-facts"><span>Pakistan</span><span>{data.stations.length} locations</span><span>1981–2025</span><span>NASA POWER · MERRA-2</span></div>
          <p className="hero-question">How much does a reported trend change when you test a different time window or uncertainty method?</p>
          <div className="hero-actions">
            <a className="primary-action" href="#region">Explore sampling locations <span aria-hidden="true">　↓</span></a>
            <a className="secondary-action" href="#stress-test">Open Evidence Stress Test</a>
          </div>
        </section>
        <Investigation data={data} />
      </main>
      <footer className="shell footer">
        <a href="/">Worldwide atlas ↗</a>
        <a href="/karachi-baseline">Karachi baseline investigation ↗</a>
        <span>Sahiwal Virtual · Pakistan</span>
      </footer>
    </>
  );
}
