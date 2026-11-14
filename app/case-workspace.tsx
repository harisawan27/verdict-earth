"use client";

import { ArrowLeft, ArrowRight, BookOpen, ChartNoAxesCombined, GitCompareArrows } from "lucide-react";
import { karachiAuditCase } from "./calibration-audit";
import { interval, signed } from "./stress-format";
import { TemperatureChart } from "./temperature-chart";

type CaseSite = { id: string; location: {city: string}; annual_series: {year: number; temperature_c: number | null}[];
  windows: {id:string; trend:{slope_c_per_decade:number}}[] };
const stories = [
  {id:"karachi", peer:"", title:"Can nearly identical warming rates lead to different statistical interpretations?", question:"Compare two periods in the same Karachi reanalysis cell.", icon:ChartNoAxesCombined},
  {id:"oslo", peer:"karachi", title:"How do the Oslo and Karachi trends compare?", question:"Compare a northern European cell with a cell on Pakistan’s coast.", icon:GitCompareArrows},
  {id:"nairobi", peer:"sao-paulo", title:"How do two tropical grid cells compare?", question:"Examine the same years in Nairobi and São Paulo.", icon:BookOpen},
];
const steps = ["Question", "Observations", "Checks", "Finding"];

export function CaseWorkspace({ chosen, sites, open, openKarachi, step, setStep }: {
  chosen: string; sites: CaseSite[]; step: number; setStep: (step: number) => void;
  open: (id: string, peer: string) => void;
  openKarachi: (window: "1981-2025" | "2001-2025") => void;
}) {
  const current = stories.find(story => story.id === chosen);
  const full = karachiAuditCase.windows[0], recent = karachiAuditCase.windows[1];
  if (!current) return <section className="workspace-cases" aria-label="Case studies">
    <div className="workspace-section-intro"><p className="eyebrow">Guided investigations</p><h2>Follow the evidence</h2><p>Start with a real NASA result, then check which conclusions the data support.</p></div>
    <div className="case-list">{stories.map(story => {
      const Icon = story.icon;
      return <article className="panel" key={story.id}><Icon aria-hidden="true"/>
        <p className="eyebrow">NASA POWER · {story.id === "karachi" ? "Karachi" : story.id === "oslo" ? "Oslo · Karachi" : "Nairobi · São Paulo"}</p>
        <h3>{story.title}</h3><p>{story.question}</p><a className="workspace-secondary" href={"#cases/"+story.id}>Investigate <ArrowRight aria-hidden="true"/></a>
      </article>;
    })}</div>
    <div className="workspace-legacy"><a href="/sindh">Sindh regional case study ↗</a><a href="/karachi-baseline">Karachi baseline ↗</a></div>
  </section>;
  const focal = sites.find(site => site.id === current.id);
  const peer = sites.find(site => site.id === current.peer);
  if (!focal) return <a href="#cases">Return to case studies</a>;
  const points = focal.annual_series.map(point => ({ ...point, fitted_c: null,
    comparison_c: peer?.annual_series.find(row => row.year === point.year)?.temperature_c ?? null }));
  const isKarachi = current.id === "karachi";
  return <article className="panel case-guide" aria-label="Guided case">
    <div className="case-guide-top"><a className="workspace-secondary" href="#cases"><ArrowLeft aria-hidden="true"/> Exit case</a><span>NASA POWER · {focal.location.city}{peer && " and " + peer.location.city}</span></div>
    <ol className="case-steps">{steps.map((label,index)=><li key={label} aria-current={step===index ? "step" : undefined}>{label}</li>)}</ol>
    <div className="case-step" aria-live="polite">
      {step === 0 && <><h2>{current.title}</h2><p>{current.question} {isKarachi ? "First inspect the annual record, then compare what two uncertainty methods say about zero." : "Ask how the two fitted rates differ and what comparison can establish."}</p></>}
      {step === 1 && <><h2>Inspect the annual temperatures</h2><p>{isKarachi ? "The same archived POWER record supplies 45 complete years. Each annual mean is calendar-day weighted." : "The chart uses near-surface air temperature from the same POWER analysis period."}</p><TemperatureChart points={points} primaryName={focal.location.city} comparisonName={peer?.location.city}/></>}
      {step === 2 && <><h2>{isKarachi ? "Change the period. Compare the intervals." : "Compare the same years."}</h2>
        {isKarachi ? <><div className="table-wrap"><table><thead><tr><th scope="col">Period</th><th scope="col">Slope (°C/decade)</th><th scope="col">Nominal 95% OLS interval</th><th scope="col">Nominal 95% HAC interval</th></tr></thead>
          <tbody>{[full,recent].map(row=><tr key={row.start}><th scope="row">{row.start}–{row.end}</th><td>{signed(row.slope_c_per_decade)}</td><td>{interval(row.nominal_intervals.conventional)}</td><td>{interval(row.nominal_intervals.hac)}</td></tr>)}</tbody></table></div>
          <div className="mission-actions"><a className="workspace-secondary" href="#local-verdict" onClick={()=>openKarachi("1981-2025")}>Inspect 1981–2025 verdict</a><a className="workspace-primary" href="#local-verdict" onClick={()=>openKarachi("2001-2025")}>Inspect 2001–2025 verdict</a></div></>
          : <><p>{focal.location.city} {signed(focal.windows[0].trend.slope_c_per_decade)} °C per decade{peer && " · " + peer.location.city + " " + signed(peer.windows[0].trend.slope_c_per_decade) + " °C per decade"}, 1981–2025.</p><a className="workspace-primary" href="#stress-test" onClick={()=>open(current.id,current.peer)}>Inspect both series ↗</a></>}
      </>}
      {step === 3 && <><h2>{isKarachi ? "The fitted rate is steady. The interpretation changes." : "The fitted rates describe these sampled cells."}</h2>
        <p>{isKarachi ? "Both long-window intervals exclude zero. The recent-window conventional interval includes zero and the HAC interval excludes it. The intervals are nominal and their coverage depends on the error process." : "The comparison uses the same calendar years and is descriptive. Neighboring or distant samples may share reanalysis errors. The app does not test a difference between the slopes."}</p>
        {isKarachi ? <p>Exploratory example independently checked from the archived monthly NASA response. <a href="/evidence-verification.v1.json">Verification record ↗</a> · <a href="#calibration-audit">Calibration audit ↗</a></p> : <a href="#methods/limits">Scientific limitations ↗</a>}
      </>}
    </div>
    <div className="case-guide-bottom"><button className="workspace-secondary" type="button" disabled={step===0} onClick={()=>setStep(step-1)}>Previous</button>
      {step<3 ? <button className="workspace-primary" type="button" onClick={()=>setStep(step+1)}>Next <ArrowRight aria-hidden="true"/></button> : <a href="#cases" className="workspace-primary">All case studies</a>}</div>
  </article>;
}
