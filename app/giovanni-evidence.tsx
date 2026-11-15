import comparison from "../data/results/giovanni-karachi.v1.json";
import { interval } from "./stress-format";

type Comparison = {
  source_url: string;
  reason?: string;
  status: string;
  dataset?: string;
  limitations?: string;
  product_doi?: string;
  matched_months?: number;
  monthly_mean_absolute_difference_c?: number;
  shared_complete_years?: number[];
  giovanni_trend?: { slope_c_per_decade: number; hac: { confidence_interval: number[] | null } };
  power_trend?: { slope_c_per_decade: number; hac: { confidence_interval: number[] | null } };
};

const record: Comparison = comparison;
const slopeLabel = new Intl.NumberFormat("en-US", {
  signDisplay: "exceptZero", minimumFractionDigits: 4, maximumFractionDigits: 4,
});

export function GiovanniEvidence() {
  const { giovanni_trend: giovanni, power_trend: power, shared_complete_years: years } = record;
  return (
    <aside className="panel source-detail giovanni-panel">
      <h3>Giovanni comparison</h3>
      {record.status === "incorporated" && giovanni && power && years?.length ? (
        <>
          <p>{record.dataset} and NASA POWER compared on {years.length} shared complete years ({years[0]}–{years.at(-1)}).</p>
          <dl className="selected-meta">
            <div><dt>Giovanni slope · nominal 95% HAC interval</dt><dd>{slopeLabel.format(giovanni.slope_c_per_decade)} · {interval(giovanni.hac.confidence_interval)} °C/decade</dd></div>
            <div><dt>POWER slope · nominal 95% HAC interval</dt><dd>{slopeLabel.format(power.slope_c_per_decade)} · {interval(power.hac.confidence_interval)} °C/decade</dd></div>
          </dl>
          {record.matched_months !== undefined && record.monthly_mean_absolute_difference_c !== undefined && (
            <p>Across {record.matched_months} matching months at the same native grid cell, the temperatures differed by {record.monthly_mean_absolute_difference_c.toFixed(3)} °C on average in absolute terms.</p>
          )}
          <p>{record.limitations}</p>
        </>
      ) : (
        <>
          <p>{record.reason}</p>
          <p>The archived NASA POWER analysis is available in Evidence Lab.</p>
        </>
      )}
      <div className="source-links">
        <a href="https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=resources">Official challenge resources ↗</a>
        <a href={record.source_url}>Open Giovanni query ↗</a>
        {record.product_doi && <a href={record.product_doi}>MERRA-2 dataset ↗</a>}
      </div>
    </aside>
  );
}
