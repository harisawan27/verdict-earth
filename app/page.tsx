import scan from "../public/world-scan/v1/manifest.json";
import data from "../data/results/world-t2m.v1.json";
import { Investigation } from "./investigation";
import { Workspace } from "./workspace";

export default function Home() {
  return <Workspace counts={{ cells: scan.valid_cells, sites: data.stations.length, period: scan.period.join("–") }}>
    <Investigation data={data} worldwide />
  </Workspace>;
}
