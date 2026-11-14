import audit from "../public/evidence-verification.v1.json";

const labels: Record<string, string> = {
  iid: "Independent Gaussian", "ar1:-.3": "Gaussian AR(1), ρ = −0.3", "ar1:.3": "Gaussian AR(1), ρ = 0.3",
  "ar1:.45": "Gaussian AR(1), ρ = 0.45", "ar1:.6": "Gaussian AR(1), ρ = 0.6",
  "ar1:.8": "Gaussian AR(1), ρ = 0.8", "ar1:.9": "Gaussian AR(1), ρ = 0.9",
  "ma1:.5": "MA(1), θ = 0.5", "ma1:.75": "MA(1), θ = 0.75", variance_ramp: "Independent, changing variance",
  ar2: "Gaussian AR(2), coefficients 0.65 and 0.25", heavy_tail_ar1: "Student-t₅ AR(1), ρ = 0.6",
};
export const karachiAuditCase = audit.case_study;

const percent = (n: number) => (100 * n).toFixed(1) + "%";

export function CalibrationAudit() {
  const examples = audit.rows.filter(row => row.years === 25 && ["iid", "ar1:.6", "ar2"].includes(row.process));
  return <section className="panel verdict-report audit-panel" id="calibration-audit" aria-labelledby="calibration-title">
    <p className="eyebrow">Uncertainty audit</p>
    <h3 id="calibration-title">How often do the intervals cover the true trend?</h3>
    <p>We simulated known zero trends and measured empirical coverage in {audit.rows.length} independent validation scenarios, with 5,000 runs per scenario. The alternative widened the HAC interval using a cutoff set on separate simulations. It failed the 93% minimum-coverage screen, so its intervals are excluded from the investigation.</p>
    <div className="table-wrap"><table aria-label="Selected 25-year simulation results">
      <thead><tr><th scope="col">25-year error process</th><th scope="col">Conventional</th><th scope="col">Nominal HAC</th><th scope="col">Calibrated candidate</th></tr></thead>
      <tbody>{examples.map(row => <tr key={row.process}><th scope="row">{labels[row.process]}</th>
        <td>{percent(row.conventional.fraction)}</td><td>{percent(row.hac.fraction)}</td><td>{percent(row.calibrated_hac.fraction)}</td></tr>)}</tbody>
    </table></div>
    <details><summary>All scenarios and Monte Carlo uncertainty</summary>
      <p>The diagnostics include 25, 35, 45 and 100 years, separate calibration and validation seeds, and scenarios absent from cutoff calibration. Brackets show 95% Wilson intervals for simulated HAC coverage, rather than uncertainty on NASA trends.</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Years</th><th scope="col">Error process</th><th scope="col">Conventional</th><th scope="col">HAC [Wilson]</th><th scope="col">Candidate</th></tr></thead>
        <tbody>{audit.rows.map(row => <tr key={row.years + row.process}><td>{row.years}</td><th scope="row">{labels[row.process]}</th>
          <td>{percent(row.conventional.fraction)}</td><td>{percent(row.hac.fraction)} [{row.hac.monte_carlo_95_wilson.map(percent).join("–")}]</td><td>{percent(row.calibrated_hac.fraction)}</td></tr>)}</tbody>
      </table></div>
    </details>
    <a href="/evidence-verification.v1.json" download>Download calibration and independent case checks JSON ↓</a>
  </section>;
}
