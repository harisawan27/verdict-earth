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
  const trials = audit.rows[0].hac.trials.toLocaleString("en-US");
  return <section className="panel verdict-report audit-panel" id="calibration-audit" aria-labelledby="calibration-title">
    <p className="eyebrow">Uncertainty audit</p>
    <h3 id="calibration-title">How often do the intervals cover the true trend?</h3>
    <p>The true slope was zero in every simulation. The audit tested {audit.validation_processes.length} error processes at {audit.lengths.length} record lengths, for {audit.rows.length} validation combinations and {trials} runs per combination. The candidate used cutoffs estimated from separate simulations. It failed the 93% minimum-coverage screen and is excluded from trend reports.</p>
    <div className="table-wrap"><table aria-label="Selected 25-year simulation results">
      <thead><tr><th scope="col">25-year error process</th><th scope="col">Conventional</th><th scope="col">Nominal HAC</th><th scope="col">Calibrated candidate</th></tr></thead>
      <tbody>{examples.map(row => <tr key={row.process}><th scope="row">{labels[row.process]}</th>
        <td>{percent(row.conventional.fraction)}</td><td>{percent(row.hac.fraction)}</td><td>{percent(row.calibrated_hac.fraction)}</td></tr>)}</tbody>
    </table></div>
    <details><summary>All scenarios and Monte Carlo uncertainty</summary>
      <p>Record lengths were {audit.lengths.slice(0, -1).join(", ")} and {audit.lengths.at(-1)} years. Calibration and validation used separate seeds. Validation included error processes absent from calibration. Brackets show 95% Wilson intervals for the simulated HAC coverage rate.</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Years</th><th scope="col">Error process</th><th scope="col">Conventional</th><th scope="col">HAC [Wilson]</th><th scope="col">Candidate</th></tr></thead>
        <tbody>{audit.rows.map(row => <tr key={row.years + row.process}><td>{row.years}</td><th scope="row">{labels[row.process]}</th>
          <td>{percent(row.conventional.fraction)}</td><td>{percent(row.hac.fraction)} [{row.hac.monte_carlo_95_wilson.map(percent).join("–")}]</td><td>{percent(row.calibrated_hac.fraction)}</td></tr>)}</tbody>
      </table></div>
    </details>
    <a href="/evidence-verification.v1.json" download>Download calibration and independent case checks JSON ↓</a>
  </section>;
}
