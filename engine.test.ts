import { extractHourlyRate, hourRange } from "./estimates.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import {
  analyze,
  analysisPrompt,
  validateGenerated,
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
test("a stopped analysis does not initialise WebLLM", async () => {
  await assert.rejects(
    analyze(
      contract,
      "Add hosting",
      () => assert.fail("Unexpected progress"),
      "",
      "en",
      { signal: AbortSignal.abort() },
    ),
    /Analysis stopped/,
  );
});
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

test("extracts a single contractual hourly rate with verbatim evidence", () => {
  for (const [clause, rate, currency] of [
    ["Hourly rate: USD 125.50", 125.5, "USD"],
    ["€80/hour", 80, "EUR"],
    ["2\u202f500,75 руб. в час", 2500.75, "RUB"],
    ["₽3 500/ч", 3500, "RUB"],
    ["1.250,50 EUR per hour", 1250.5, "EUR"],
  ] as const) {
    assert.deepEqual(extractHourlyRate("Terms\n" + clause + "\nEnd"), {
      rate,
      currency,
      evidence: clause,
    });
  }
  assert.equal(extractHourlyRate("Fixed price: USD 500."), undefined);
  assert.equal(
    extractHourlyRate("100 EUR/hour for design. 150 EUR/hour for development."),
    undefined,
  );
  assert.equal(extractHourlyRate("€100–€150/hour"), undefined);
  assert.equal(extractHourlyRate("Hourly rate: 100–150 EUR/hour"), undefined);
  assert.equal(extractHourlyRate("-€100/hour"), undefined);
});

test("derives totals from every task range and ignores a supplied total", () => {
  const tasks = [
    { task: "Layout", minHours: 1.01, maxHours: 2, assumptions: "One layout." },
    { task: "Review", minHours: 0.5, maxHours: 1, assumptions: "One round." },
  ];
  assert.deepEqual(hourRange(tasks), { min: 1.51, max: 3, midpoint: 2.255 });
  assert.equal(
    validateGenerated({ ...result, hours: 999, tasks }, contract, "en").hours,
    2.255,
  );
  assert.equal(revenue(2.255, 100), 225.5);
  assert.equal(revenue(1.005, 1), 1.01);
  for (const task of [
    { ...tasks[0], minHours: 3 },
    { ...tasks[0], minHours: 0.123 },
    { ...tasks[0], assumptions: "" },
  ])
    assert.throws(
      () => validateGenerated({ ...result, tasks: [task] }, contract, "en"),
      /Invalid task estimates/,
    );
  assert.throws(
    () => validateGenerated(result, contract, "en"),
    /Invalid task estimates/,
  );
});

test("localizes generated reasoning and assumptions but preserves quotes verbatim", () => {
  const tasks = [
    { task: "Хостинг", minHours: 1, maxHours: 2, assumptions: "Один сайт." },
  ];
  const russian = { ...result, reasoning: "Договор исключает хостинг.", tasks };
  assert.match(
    analysisPrompt("ru", false),
    /Write all generated prose in Russian/,
  );
  assert.match(
    analysisPrompt("en", true),
    /Write all generated prose in English/,
  );
  assert.equal(validateGenerated(russian, contract, "ru").evidence, contract);
  assert.throws(
    () => validateGenerated(russian, contract, "en"),
    /different language/,
  );
  assert.throws(
    () =>
      validateGenerated(
        { ...russian, tasks: [{ ...tasks[0], assumptions: "One site only." }] },
        contract,
        "ru",
      ),
    /different language/,
  );
  assert.throws(
    () =>
      validateGenerated(
        { ...russian, evidence: "Хостинг исключён." },
        contract,
        "ru",
      ),
    /Evidence must match/,
  );
});
