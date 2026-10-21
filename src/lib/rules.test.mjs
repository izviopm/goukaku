import { test } from "node:test";
import assert from "node:assert/strict";
import { structureError, topicPlan, questionsFromCsv, modelSettingsError } from "./rules.ts";

test("modelSettingsError", () => {
  const models = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "" }];
  assert.equal(modelSettingsError({ models, main: "a", verifiers: ["b", "c"] }), null);
  assert.equal(modelSettingsError({ models, main: "a", verifiers: [] }), null);
  assert.match(modelSettingsError({ models: [], main: "", verifiers: [] }), /at least one model/);
  assert.match(modelSettingsError({ models: [...models, { id: "a", name: "dup" }], main: "a", verifiers: [] }), /same ID/);
  assert.match(modelSettingsError({ models, main: "x", verifiers: [] }), /main model/);
  assert.match(modelSettingsError({ models, main: "a", verifiers: ["b"] }), /at least 2/);
  assert.match(modelSettingsError({ models, main: "a", verifiers: ["b", "z"] }), /from the list/);
});

test("structureError", () => {
  const ok = { body: "Q", options: ["a", "b", "c", "d"], answer: "b" };
  assert.equal(structureError(ok), null);
  assert.match(structureError({ ...ok, answer: "E" }), /not one of the options/);
  assert.match(structureError({ ...ok, answer: "AB" }), /exactly one letter/);
  assert.match(structureError({ ...ok, options: ["a"] }), /2 to 5 options/);
  assert.match(structureError({ ...ok, options: ["a", "A ", "c"] }), /the same/);
});

test("topicPlan follows percentages and sums to total", () => {
  const plan = topicPlan([{ topic: "x", percentage: 50 }, { topic: "y", percentage: 30 }, { topic: "z", percentage: 20 }], 7);
  assert.equal(plan.length, 7);
  assert.equal(plan.filter((t) => t === "x").length, 4); // 3.5 -> 4 by largest remainder
  assert.equal(topicPlan([{ topic: "x", percentage: 33.3 }, { topic: "y", percentage: 66.7 }], 60).length, 60);
});

test("questionsFromCsv handles quotes, commas and newlines", () => {
  const csv = 'Question,A,B,C,D,Answer,Explanation,Topic\r\n"What is ""x"", really?",1,"2,5","multi\nline",4,b,because,Math\r\n';
  const [q] = questionsFromCsv(csv);
  assert.equal(q.body, 'What is "x", really?');
  assert.deepEqual(q.options, ["1", "2,5", "multi\nline", "4"]);
  assert.equal(q.answer, "b");
  assert.equal(q.topic, "Math");
});
