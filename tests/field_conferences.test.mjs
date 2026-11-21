// Hard rule (the commissioner's, Season 3): no two teams from the same conference may meet in the first or second
// round, i.e. share a pod (1/16/8/9, 5/12/4/13, 6/11/3/14, 7/10/2/15) within a region.
import test from "node:test";
import assert from "node:assert/strict";
import { suggestField, validateField, conferenceConflicts } from "../js/league/field.js";

// 31 conferences: 6 huge ones that put 6 teams each in the field, so a plain S-curve is bound to collide.
function rows() {
  const out = []; let id = 0;
  for (let c = 0; c < 31; c++) for (let k = 0; k < 10; k++) {
    const big = c < 6, s = big ? 40 - k * 2.5 - c * 0.4 : (k === 0 ? 5 - c * 0.3 : -30 - k);
    out.push({ team: id++, conf: `C${c}`, score: s, seedScore: s });
  }
  return out;
}

test("the field suggester never puts same-conference teams in the same pod", () => {
  const R = rows(), confOf = new Map(R.map((r) => [r.team, r.conf]));
  const picks = suggestField(R, 37), field = picks.filter((p) => p.group === "Field");
  assert.equal(conferenceConflicts(field, confOf).length, 0);
  assert.deepEqual(validateField(picks, confOf).errors, []);
  assert.ok(field.filter((p) => p.seed === 1).every((p) => p.team < 6 * 10), "top seeds still come from the top of the S-curve");
});

test("validateField rejects a same-conference first- or second-round meeting", () => {
  const R = rows(), confOf = new Map(R.map((r) => [r.team, r.conf]));
  const picks = suggestField(R, 37), field = picks.filter((p) => p.group === "Field");
  const one = field.find((p) => p.seed === 1 && p.region === "East");
  const eight = field.find((p) => p.seed === 8 && p.region === "East" && !p.ff);
  const mate = field.find((p) => p.team !== one.team && confOf.get(p.team) === confOf.get(one.team) && !p.ff && p.seed > 1);
  // put the 1 seed's conference-mate on the East 8 line (swap with whoever is there)
  [mate.region, eight.region] = [eight.region, mate.region]; [mate.seed, eight.seed] = [eight.seed, mate.seed];
  const errs = validateField(picks, confOf).errors;
  assert.ok(errs.some((e) => /first or second round/.test(e)), errs.join("\n"));
});

test("the two teams of one First Four game are not checked against each other", () => {
  const confOf = new Map([[1, "X"], [2, "X"]]);
  assert.equal(conferenceConflicts([{ team: 1, seed: 11, region: "East", ff: 1 }, { team: 2, seed: 11, region: "East", ff: 1 }], confOf).length, 0);
});
