// Stamps the stylesheet link in every page with a short hash of css/app.css (css/app.css?v=<hash>), so browsers and
// GitHub Pages' cache fetch the new styles right after a change. Run after editing css/app.css (a unit test checks it).
import fs from "node:fs";
import crypto from "node:crypto";
export const cssHash = () => crypto.createHash("sha1").update(fs.readFileSync("css/app.css")).digest("hex").slice(0, 8);
if (import.meta.url === `file://${process.argv[1]}`) {
  const v = cssHash(); let n = 0;
  for (const f of fs.readdirSync(".").filter((f) => f.endsWith(".html"))) {
    const s = fs.readFileSync(f, "utf8"), t = s.replace(/href="css\/app\.css(\?v=[0-9a-f]+)?"/, `href="css/app.css?v=${v}"`);
    if (t !== s) { fs.writeFileSync(f, t); n++; }
  }
  console.log(`css/app.css?v=${v} stamped in ${n} page(s)`);
}
