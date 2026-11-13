import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cssHash } from "../tools/stamp_css.mjs";

test("every page links the current stylesheet version (run node tools/stamp_css.mjs after editing css/app.css)", () => {
  const v = cssHash();
  for (const f of fs.readdirSync(".").filter((f) => f.endsWith(".html"))) {
    const s = fs.readFileSync(f, "utf8"); if (!s.includes("css/app.css")) continue;
    assert.ok(s.includes(`href="css/app.css?v=${v}"`), `${f} links an old stylesheet version`);
  }
});
