import test from "node:test";
import assert from "node:assert/strict";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import {
  analyze,
  compatibleModels,
  readFile,
  revenue,
  validate,
} from "./engine.ts";

test("orders installed models that can run without shader-f16", () => {
  const preferred = "SmolLM3-3B-q4f32_1-MLC";
  const fallback = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
  const catalog = prebuiltAppConfig.model_list;
  assert.deepEqual(compatibleModels(catalog, new Set()), [preferred, fallback]);
  const requiringF16 = catalog.map((model) =>
    model.model_id === preferred
      ? { ...model, required_features: ["shader-f16"] }
      : model,
  );
  assert.deepEqual(compatibleModels(requiringF16, new Set()), [fallback]);
  assert.deepEqual(compatibleModels(requiringF16, new Set(["shader-f16"])), [
    preferred,
    fallback,
  ]);
  assert.deepEqual(compatibleModels([], new Set()), []);
});

const contract = "Hosting is excluded.";
const result = {
  status: "out_of_scope",
  reasoning: "The request adds hosting.",
  evidence: contract,
  hours: 1.5,
};
test("rejects an altered excerpt before loading the model", async () => {
  await assert.rejects(
    analyze(contract, "Add hosting", () => {}, "Hosting is included."),
    /excerpt must match/,
  );
});
test("requires exact contract evidence for a definitive decision", () => {
  assert.deepEqual(validate(result, contract), result);
  for (const evidence of ["", "Hosting is included.", "  "]) {
    assert.throws(() => validate({ ...result, evidence }, contract));
  }
  assert.equal(
    validate({ ...result, status: "uncertain", evidence: "" }, contract)
      .evidence,
    "",
  );
});
test("rejects invalid structured output", () => {
  for (const change of [
    { hours: -1 },
    { hours: Infinity },
    { hours: "4" },
    { status: "unknown" },
    { reasoning: " " },
  ]) {
    assert.throws(() => validate({ ...result, ...change }, contract));
  }
});
test("rounds currency after multiplying the rate by hours", () => {
  assert.equal(revenue(1.5, 12.35), 18.53);
  assert.equal(revenue(0, 100), 0);
  assert.throws(() => revenue(-1, 30));
});
test("reads plain text and rejects unsupported or blank files", async () => {
  assert.equal(await readFile(new File([contract], "agreement.TXT")), contract);
  await assert.rejects(readFile(new File([" "], "blank.txt")));
  await assert.rejects(readFile(new File(["text"], "contract.docx")));
});
