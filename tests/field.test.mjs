import test from "node:test";
import assert from "node:assert/strict";
import { movement, fieldChanges } from "../js/league/field.js";

const F = (team, seed, extra = {}) => ({ group: "Field", team, seed, region: "East", ...extra }), B = (team, group, bubble = 1) => ({ group, team, seed: null, bubble });
test("movement words and arrows", () => {
  assert.deepEqual(movement(F(1, 2), F(1, 4)), { kind: "up", n: 2, short: "▲2", long: "Up 2" });
  assert.deepEqual(movement(F(1, 6), F(1, 5)), { kind: "down", n: 1, short: "▼1", long: "Down 1" });
  assert.equal(movement(F(1, 3), F(1, 3)).kind, "same");
  assert.equal(movement(F(1, 3), undefined).kind, "new");
  assert.equal(movement(F(1, 12), B(1, "First Four Out")).long, "In (was first four out)");
  assert.equal(movement(B(1, "Next Four Out"), F(1, 6)).long, "Out (was a 6 seed)");
  assert.equal(movement(B(1, "First Four Out"), B(1, "Next Four Out")).kind, "up");
});
test("field changes list the risers, fallers, newcomers and the dropped", () => {
  const prev = [F(1, 1), F(2, 4), F(3, 6), F(4, 9), B(5, "First Four Out"), B(6, "Next Four Out")], cur = [F(1, 1), F(2, 2), F(3, 8), F(5, 11), B(4, "First Four Out")];
  const c = fieldChanges(cur, prev);
  assert.deepEqual(c.up.map((r) => [r.team, r.m.n]), [[2, 2]]); assert.deepEqual(c.down.map((r) => [r.team, r.m.n]), [[3, 2]]);
  assert.deepEqual(c.newIn.map((r) => r.team), [5]); assert.deepEqual(c.dropped.map((r) => [r.team, r.was.seed, r.now.group]), [[4, 9, "First Four Out"]]); assert.deepEqual(c.same.map((r) => r.team), [1]);
});
