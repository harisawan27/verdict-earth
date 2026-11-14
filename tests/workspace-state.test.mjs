import test from "node:test";
import assert from "node:assert/strict";
import { destinationHref, workspaceRoute } from "../app/workspace-state.ts";

test("workspace routes retain the dataset and evidence view", () => {
  assert.deepEqual(workspaceRoute(destinationHref("evidence", "power", "verdict")),
    {page:"evidence",dataset:"power",view:"verdict"});
  assert.deepEqual(workspaceRoute("#explore/gistemp","power"),
    {page:"explore",dataset:"gistemp",view:""});
  assert.deepEqual(workspaceRoute("#methods/giovanni","power"),
    {page:"methods",dataset:"power",view:"giovanni"});
});

test("previous public section links resolve to the correct tools", () => {
  const expected = {
    "#region": ["explore","gistemp",""], "#scan-series": ["evidence","gistemp","trend"],
    "#global-stress": ["evidence","gistemp","sensitivity"], "#global-evidence": ["evidence","gistemp","comparison"],
    "#stress-test": ["evidence","power","trend"], "#local-calculations": ["evidence","power","uncertainty"],
    "#local-verdict": ["evidence","power","verdict"], "#karachi-case": ["cases","power","karachi"],
    "#calibration-audit": ["methods","power","calibration"], "#how-we-know": ["methods","power","sources"],
  };
  for (const [hash,[page,dataset,view]] of Object.entries(expected)) {
    assert.deepEqual(workspaceRoute(hash),{page,dataset,view});
  }
  assert.deepEqual(workspaceRoute("#evidence/power/invalid"),{page:"evidence",dataset:"power",view:"trend"});
  assert.deepEqual(workspaceRoute("#nothing","power"),{page:"overview",dataset:"power",view:""});
});
