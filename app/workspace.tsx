"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ArrowDownToLine, ArrowRight, BookOpen, CircleHelp, Compass, FlaskConical, Globe2, LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { destinationHref, initialRoute, WorkspaceContext, workspaceRoute } from "./workspace-state";
import type { ContextSummary, Dataset, Destination } from "./workspace-state";

const navigation = [
  { id: "overview", title: "Overview", short: "Home", icon: LayoutGrid },
  { id: "explore", title: "Explore Earth", short: "Explore", icon: Compass },
  { id: "evidence", title: "Evidence Lab", short: "Evidence", icon: Activity },
  { id: "cases", title: "Case Studies", short: "Cases", icon: BookOpen },
  { id: "methods", title: "Methods & Sources", short: "Methods", icon: FlaskConical },
] as const;
const entryText = ["Inspect a GISTEMP cell or request a POWER record by place or coordinates.", "Change the period and test the evidence.", "See how a shorter period changes the Karachi verdict."];

export function Workspace({ children, counts }: { children: ReactNode; counts: { cells: number; period: string } }) {
  const [route, setRoute] = useState(initialRoute);
  const [compact, setCompact] = useState(false);
  const [help, setHelp] = useState(false);
  const [summaries, setSummaries] = useState<Partial<Record<Dataset, ContextSummary>>>({});
  const main = useRef<HTMLElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function sync() {
      setRoute(previous => workspaceRoute(window.location.hash, previous.dataset));
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [route.page, route.view, route.dataset]);

  const updateSummary = useCallback((dataset: Dataset, summary: ContextSummary) => {
    setSummaries(previous => ({ ...previous, [dataset]: summary }));
  }, []);
  const destination = navigation.find(item => item.id === route.page)!;
  const summary = summaries[route.dataset];
  const inAnalysis = route.page === "explore" || route.page === "evidence";
  const datasetName = route.dataset === "gistemp" ? "GISTEMP" : "POWER";
  function closeHelp() {
    setHelp(false);
    helpButton.current?.focus();
  }

  return <WorkspaceContext.Provider value={{ route, updateSummary }}>
    <div className={"earth-workspace" + (compact ? " workspace-compact" : "")}>
      <a className="skip-link" href="#workspace-content" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Skip to workspace</a>
      <aside className="workspace-sidebar" aria-label="Sidebar">
        <a className="workspace-brand" href="#overview" aria-label="Verdict Earth overview"><Globe2 aria-hidden="true" />
          <span><strong>VERDICT EARTH</strong><small>NASA temperature evidence</small></span>
        </a>
        <nav aria-label="Primary navigation">
          {navigation.map(({id,title,short,icon: Icon}) => <a href={destinationHref(id,route.dataset)} key={id}
            aria-current={route.page === id ? "page" : undefined} title={title}><Icon aria-hidden="true" />
            <span className="nav-label">{title}</span><span className="nav-short">{short}</span></a>)}
        </nav>
        <div className="sidebar-foot"><span>NASA data · Natural Earth</span><span>Space Apps Challenge 2026</span>
          <a href="#methods/sources">Sources &amp; credits</a></div>
        <button className="sidebar-toggle" type="button" onClick={() => setCompact(!compact)}
          aria-label="Toggle sidebar width" aria-pressed={compact}>
          {compact ? <PanelLeftOpen aria-hidden="true"/> : <PanelLeftClose aria-hidden="true"/>}
        </button>
      </aside>
      <div className="workspace-body">
        <header className="workspace-toolbar">
          <a className="mobile-brand" href="#overview" aria-label="Verdict Earth overview"><Globe2 aria-hidden="true"/></a>
          <h1>{destination.title}</h1>
          {inAnalysis && <div className="workspace-context" aria-live="polite">
            <span className="context-dataset">{datasetName}</span><span className="context-location">{summary?.location ?? "Karachi"}</span>
            <span className="context-period">{summary?.period ?? counts.period}</span>
          </div>}
          <div className="workspace-actions">
            {inAnalysis && summary?.exportAction && <button type="button" className="workspace-icon" aria-label="Export current analysis" title="Export current analysis" onClick={summary.exportAction}><ArrowDownToLine aria-hidden="true"/></button>}
            <button ref={helpButton} type="button" className="workspace-icon" aria-label="Help" aria-expanded={help}
              aria-controls="workspace-help" onClick={() => setHelp(!help)}><CircleHelp aria-hidden="true"/></button>
          </div>
        </header>
        <div id="workspace-help" className="workspace-help panel" hidden={!help} onKeyDown={event => { if (event.key === "Escape") closeHelp(); }}>
          <h2>Start an investigation</h2>
          <ol><li>In Explore Earth, select a GISTEMP grid cell or request a POWER record by place or coordinates.</li><li>Open Evidence Lab and choose a time window.</li><li>Read the verdict, inspect the sources, or export your results.</li></ol>
          <button type="button" className="workspace-secondary" onClick={closeHelp}>Dismiss</button>
        </div>
        <main ref={main} tabIndex={-1} id="workspace-content" className={"workspace-content workspace-" + route.page}>
          {route.page === "overview" && <div className="mission-overview">
            <section className="mission-hero" aria-labelledby="mission-title">
              <div className="mission-globe" aria-hidden="true" />
              <div className="mission-copy"><p className="eyebrow">NASA Space Apps Challenge 2026</p>
                <h2 id="mission-title">Don’t just detect a trend.<br/><span>Test whether it survives scrutiny.</span></h2>
                <p>Map surface temperature anomalies, investigate local air temperature, and see how the choice of period and method changes the evidence.</p>
                <div className="mission-actions"><a className="workspace-primary" href={destinationHref("explore",route.dataset)}>Explore Earth <ArrowRight aria-hidden="true"/></a>
                  <a className="workspace-secondary" href={destinationHref("evidence",route.dataset)}>Try an investigation</a></div>
              </div>
            </section>
            <dl className="mission-data"><div><dt>GISTEMP cells with a mapped trend</dt><dd>{counts.cells.toLocaleString("en-US")}</dd></div><div><dt>NASA POWER point coverage</dt><dd>Worldwide lookup</dd></div>
              <div><dt>Default analysis period</dt><dd>{counts.period}</dd></div><div><dt>NASA products &amp; tools</dt><dd><a href="#methods/sources">GISTEMP · POWER · Giovanni</a></dd></div></dl>
            <div className="mission-entry">{(["explore","evidence","cases"] as Destination[]).map((page,i) => {
              const Icon = navigation.find(item => item.id === page)!.icon;
              return <a className="panel" key={page} href={destinationHref(page,route.dataset,page === "cases" ? "karachi" : undefined)}>
                <Icon aria-hidden="true"/><div><strong>{["Explore the planet","Challenge a trend","Follow a scientific case"][i]}</strong><p>{entryText[i]}</p></div><ArrowRight aria-hidden="true"/>
              </a>;
            })}</div>
            <div className="mission-case"><p className="eyebrow">Guided case · Karachi</p><a href="#cases/karachi">Can nearly identical warming rates lead to different statistical interpretations? <ArrowRight aria-hidden="true"/></a></div>
          </div>}
          {children}
        </main>
      </div>
    </div>
  </WorkspaceContext.Provider>;
}
