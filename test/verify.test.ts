import { test } from "node:test";
import assert from "node:assert/strict";
import { numbersBacked, verify, verifyField } from "../src/index.ts";

const doc = `Hi team,
Could you quote 3,000 pcs of the LB-220 lunch bag in navy and sage?
We need the goods by 15 March. Target price is USD 4.20 per piece.`;

test("verified when quote is verbatim and numbers match", () => {
  const r = verifyField("qty", "3000 pcs", "quote 3,000 pcs", doc);
  assert.equal(r.status, "verified");
});

test("tolerates whitespace and curly-quote differences", () => {
  const r = verifyField("model", "LB-220", "the  LB-220\nlunch bag", doc);
  assert.equal(r.status, "verified");
  const curly = verifyField("x", "ok", "“hi” there", 'He said "hi" there.');
  assert.equal(curly.status, "verified");
});

test("rejects a quote that is not in the document", () => {
  const r = verifyField("qty", "5000 pcs", "quote 5,000 pcs", doc);
  assert.deepEqual(
    [r.status, r.status === "rejected" && r.reason],
    ["rejected", "quote_not_found"],
  );
});

test("rejects a real quote carrying an invented number", () => {
  const r = verifyField("price", "USD 3.80", "Target price is USD 4.20", doc);
  assert.equal(r.status === "rejected" && r.reason, "number_not_in_quote");
});

test("rejects a placeholder value pinned to an unrelated real quote", () => {
  const r = verifyField("price", "Not stated", "We need the goods by 15 March", doc);
  assert.equal(r.status === "rejected" && r.reason, "value_not_in_quote");
  const zh = verifyField("color", "白色", "颜色白色", "今年想订，颜色白色。");
  assert.equal(zh.status, "verified");
});

test("decimal formatting is compared numerically", () => {
  assert.ok(numbersBacked("USD 4.20", "USD 4.2"));
  assert.ok(numbersBacked("15 March", "by 15 March"));
  assert.ok(!numbersBacked("16 March", "by 15 March"));
});

test("empty value is missing; tiny quote is rejected", () => {
  assert.equal(verifyField("x", "", "", doc).status, "missing");
  assert.equal(
    (verifyField("x", "navy", "n", doc) as { reason?: string }).reason,
    "quote_too_short",
  );
});

test("verify parses fenced JSON and drops unknown/garbage", () => {
  const out =
    '```json\n{"fields":{"qty":{"value":"3,000","quote":"3,000 pcs"},"date":{"value":"1 April","quote":"by 1 April"}}}\n```';
  const r = verify(out, doc, [
    { key: "qty", description: "" },
    { key: "date", description: "" },
    { key: "port", description: "" },
  ]);
  assert.deepEqual(
    r.map((f) => f.status),
    ["verified", "rejected", "missing"],
  );
  assert.equal(verify("not json", doc, [{ key: "q", description: "" }])[0].status, "missing");
});
