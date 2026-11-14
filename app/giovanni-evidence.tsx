import comparison from "../data/results/giovanni-karachi.v1.json";
import { interval, signed } from "./stress-format";

type Comparison = {
  source_url: string;
  reason?: string;
  status: string;
  dataset?: string;
  limitations?: string;
  shared_complete_years?: number[];
  giovanni_trend?: { slope_c_per_decade: number; hac: { confidence_interval: number[] | null } };
  power_trend?: { slope_c_per_decade: number; hac: { confidence_interval: number[] | null } };
};

const record: Comparison = comparison;

export function GiovanniEvidence() {
  const { giovanni_trend: giovanni, power_trend: power, shared_complete_years: years } = record;
  return (
    <aside className="panel source-detail giovanni-panel">
      <h3>Giovanni comparison</h3>
      {record.status === "incorporated" && giovanni && power && years?.length ? (
        <>
          <p>{record.dataset} and NASA POWER compared on {years.length} shared complete years ({years[0]}–{years.at(-1)}).</p>
          <dl className="selected-meta">
            <div><dt>Giovanni slope · 95% HAC interval</dt><dd>{signed(giovanni.slope_c_per_decade)} · {interval(giovanni.hac.confidence_interval)} °C/decade</dd></div>
            <div><dt>POWER slope · 95% HAC interval</dt><dd>{signed(power.slope_c_per_decade)} · {interval(power.hac.confidence_interval)} °C/decade</dd></div>
          </dl>
          <p>{record.limitations}</p>
        </>
      ) : (
        <>
          <p>{record.reason}</p>
          <p>Global Awards eligibility is unconfirmed while the analysis uses POWER alone.</p>
        </>
      )}
      <div className="source-links">
        <a href="https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources">Official challenge resources ↗</a>
        <a href={record.source_url}>Open Giovanni query ↗</a>
      </div>
    </aside>
  );
}
