"use client";

import type { ReactNode } from "react";

export function downloadEvidence(name: string, result: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + "\n"], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VerdictReport({ id, title, label, reason, items, calculations, calculationLabel, download }: {
  id: string;
  title: string;
  label: string;
  reason: string;
  items: { heading: string; detail: ReactNode }[];
  calculations: string;
  calculationLabel: string;
  download: () => void;
}) {
  return <article className="panel verdict-report" aria-labelledby={id + "-title"} id={id}>
    <div className="verdict-head">
      <div><p className="eyebrow">Evidence report</p><h3 id={id + "-title"}>{title}</h3></div>
      <button className="secondary-action verdict-download" type="button" onClick={download}>Download report JSON ↓</button>
    </div>
    <div className="verdict-result" aria-live="polite"><strong>{label}</strong><p>{reason}</p></div>
    <dl className="verdict-fields">{items.map(({ heading, detail }) => (
      <div key={heading}><dt>{heading}</dt><dd>{detail}</dd></div>
    ))}</dl>
    <a className="verdict-link" href={calculations}>{calculationLabel} ↓</a>
  </article>;
}
