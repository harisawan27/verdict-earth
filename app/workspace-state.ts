"use client";

import { createContext, useContext } from "react";
export type Destination = "overview" | "explore" | "evidence" | "cases" | "methods";
export type Dataset = "gistemp" | "power";
export type WorkspaceRoute = { page: Destination; dataset: Dataset; view: string };
export type ContextSummary = { location: string; period: string; exportAction?: () => void };

export const evidenceViews = [
  ["trend", "Trend"], ["uncertainty", "Uncertainty"], ["sensitivity", "Sensitivity"],
  ["comparison", "Comparison"], ["verdict", "Verdict"],
] as const;
export const methodViews = [
  ["sources", "Data sources"], ["methods", "Scientific methods"], ["calibration", "Calibration"],
  ["limits", "Limitations"], ["reproduce", "Reproducibility"], ["giovanni", "Giovanni"],
] as const;
export const initialRoute: WorkspaceRoute = { page: "overview", dataset: "gistemp", view: "" };
const legacy: Record<string, WorkspaceRoute> = {
  top: initialRoute, region: { page:"explore", dataset:"gistemp", view:"" },
  "global-evidence": { page:"evidence", dataset:"gistemp", view:"comparison" },
  "global-stress": { page:"evidence", dataset:"gistemp", view:"sensitivity" },
  "global-window-results": { page:"evidence", dataset:"gistemp", view:"sensitivity" },
  "global-verdict": { page:"evidence", dataset:"gistemp", view:"verdict" },
  "scan-series": { page:"evidence", dataset:"gistemp", view:"trend" },
  "stress-test": { page:"evidence", dataset:"power", view:"trend" },
  "local-verdict": { page:"evidence", dataset:"power", view:"verdict" },
  "local-calculations": { page:"evidence", dataset:"power", view:"uncertainty" },
  featured: { page:"cases", dataset:"gistemp", view:"" },
  "karachi-case": { page:"cases", dataset:"power", view:"karachi" },
  "how-we-know": { page:"methods", dataset:"power", view:"sources" },
  "calibration-audit": { page:"methods", dataset:"power", view:"calibration" },
};

export function workspaceRoute(hash: string, currentDataset: Dataset = "gistemp"): WorkspaceRoute {
  const key = hash.replace(/^#/, "");
  if (legacy[key]) return legacy[key];
  const [page, part, subview] = key.split("/");
  const dataset = part === "power" || part === "gistemp" ? part : currentDataset;
  if (page === "explore") return { page, dataset, view:"" };
  if (page === "evidence") {
    const candidate = subview ?? (part === dataset ? "" : part);
    return { page, dataset, view: evidenceViews.some(([id]) => id === candidate) ? candidate : "trend" };
  }
  if (page === "methods") return { page, dataset, view: methodViews.some(([id]) => id === part) ? part : "sources" };
  if (page === "cases") return { page, dataset, view: ["karachi","oslo","nairobi"].includes(part) ? part : "" };
  return { ...initialRoute, dataset: currentDataset };
}
export function destinationHref(page: Destination, dataset: Dataset, view?: string) {
  if (page === "explore") return "#explore/" + dataset;
  if (page === "evidence") return "#evidence/" + dataset + "/" + (view ?? "trend");
  return "#" + page + (view ? "/" + view : "");
}
export const WorkspaceContext = createContext<{
  route: WorkspaceRoute;
  updateSummary: (dataset: Dataset, summary: ContextSummary) => void;
} | null>(null);
export const useWorkspace = () => useContext(WorkspaceContext);
