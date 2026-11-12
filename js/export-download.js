// Browser side of "Export for bracketology": the season so far plus a full backup of everything saved in this browser,
// in one file. The bracketology session publishes the edition AND commits the backup to the repo (data/backups/latest.json).
import { buildSeasonExport } from "./league/export.js";
import { exportAll } from "./league/store.js";

export async function downloadSeasonExport(core) {
  const x = buildSeasonExport(core.state, { id: core.season.id, label: core.season.label, status: core.season.status });
  x.backup = await exportAll();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(x)], { type: "application/json" }));
  a.download = `hardwood-${core.season.id}-through-day-${x.throughDay}.json`; a.click();
  return x;
}
