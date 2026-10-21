import { test } from "node:test";
import assert from "node:assert/strict";
import { AllFailedError, firstSuccess, upToN } from "./fallback.ts";

const fatal = (e) => e?.fatal === true;
const fake = (down, calls = []) => async (m) => {
  calls.push(m);
  if (down[m] === "fatal") throw Object.assign(new Error("bad key"), { fatal: true });
  if (down[m]) throw new Error(`${m} is down`);
  return `answer from ${m}`;
};

test("firstSuccess falls back in order and reports failures", async () => {
  const r = await firstSuccess(["a", "b", "c"], fake({ a: true }), fatal);
  assert.equal(r.model, "b");
  assert.deepEqual(r.failed.map((f) => f.model), ["a"]);
});

test("firstSuccess stops on a fatal error", async () => {
  const calls = [];
  await assert.rejects(firstSuccess(["a", "b"], fake({ a: "fatal" }, calls), fatal), /bad key/);
  assert.deepEqual(calls, ["a"]);
});

test("firstSuccess throws AllFailedError when every model is down", async () => {
  await assert.rejects(firstSuccess(["a", "b"], fake({ a: true, b: true }), fatal), AllFailedError);
});

test("upToN uses at most n models when all are up", async () => {
  const calls = [];
  const r = await upToN(["a", "b", "c", "d", "e"], 3, fake({}, calls), fatal);
  assert.deepEqual(r.ok.map((x) => x.model), ["a", "b", "c"]);
  assert.deepEqual(calls, ["a", "b", "c"]);
});

test("upToN replaces a down model with the next backup only", async () => {
  const calls = [];
  const r = await upToN(["a", "b", "c", "d", "e"], 3, fake({ b: true }, calls), fatal);
  assert.deepEqual(r.ok.map((x) => x.model), ["a", "c", "d"]);
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  assert.deepEqual(r.failed.map((f) => f.model), ["b"]);
});

test("upToN returns fewer than n when the pool runs out", async () => {
  const r = await upToN(["a", "b"], 3, fake({ a: true }), fatal);
  assert.deepEqual(r.ok.map((x) => x.model), ["b"]);
});
