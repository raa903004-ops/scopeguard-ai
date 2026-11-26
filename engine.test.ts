import { upgradeWorkspace } from "./workspace-db.ts";
import { extractHourlyRate, hourRange } from "./estimates.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import {
  analyze,
  analysisPrompt,
  contractClauses,
  groundedResult,
  validateGenerated,
  compatibleModels,
  readFile,
  revenue,
  validate,
} from "./engine.ts";

test("starts with the lightest compatible model and prefers a reusable model", () => {
  const f32 = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
  const f16 = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
  const fallback = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
  const large = "SmolLM3-3B-q4f32_1-MLC";
  const catalog = prebuiltAppConfig.model_list;
  assert.deepEqual(compatibleModels(catalog, new Set()), [
    f32,
    fallback,
    large,
  ]);
  assert.deepEqual(compatibleModels(catalog, new Set(["shader-f16"])), [
    f16,
    f32,
    fallback,
    large,
  ]);
  assert.deepEqual(compatibleModels(catalog, new Set(), f16), [
    f32,
    fallback,
    large,
  ]);
  assert.deepEqual(compatibleModels(catalog, new Set(), fallback), [
    fallback,
    f32,
    large,
  ]);
  assert.deepEqual(
    compatibleModels(
      catalog.map((model) =>
        model.model_id === f32
          ? { ...model, required_features: ["shader-f16"] }
          : model,
      ),
      new Set(),
    ),
    [fallback, large],
  );
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

test("rejects negative, unsupported, ambiguous and non-hourly clauses", () => {
  for (const clause of [
    "CAD pricing: $100/hour",
    "£100/hour",
    "100 JPY per hour",
    "AUD $100/hour",
    "CAD pricing:\n$100/hour",
    "Hourly rate: EUR 80/day",
    "Hourly rate: EUR 80 per day",
    "Hourly rate: EUR 80/8 hours",
    "Rate: - €100/hour",
    "Hourly rate: − EUR 100",
    "Hourly rate: - EUR 100",
    "€1,2,3/hour",
  ])
    assert.equal(extractHourlyRate(clause), undefined, clause);
  assert.deepEqual(extractHourlyRate("$100/hour"), {
    rate: 100,
    currency: null,
    evidence: "$100/hour",
  });
  assert.deepEqual(extractHourlyRate("US$100/hour"), {
    rate: 100,
    currency: "USD",
    evidence: "US$100/hour",
  });
});

test("rejects punctuation quotes and unsafe task totals before billing", () => {
  assert.throws(
    () => validate({ ...result, evidence: "." }, contract),
    /Evidence must match/,
  );
  assert.throws(
    () => validate({ ...result, evidence: " ", status: "uncertain" }, contract),
    /Evidence must match/,
  );
  const task = {
    task: "Hosting",
    minHours: 20000,
    maxHours: 60000,
    assumptions: "One site only.",
  };
  assert.throws(
    () => validate({ ...result, tasks: [task, task] }, contract),
    /Invalid task estimates/,
  );
  assert.throws(() => revenue(1, -100), /valid rate/);
  assert.throws(() => revenue(1, 1e308), /valid rate/);
});

test("selects only verbatim clauses, with no chargeable decision for absent evidence", () => {
  const text = "Hosting is excluded.\nThe rate is USD 125.50 per hour.";
  const clauses = contractClauses(text);
  assert.deepEqual(clauses, [
    "Hosting is excluded.",
    "The rate is USD 125.50 per hour.",
  ]);
  const row = { ...result, clause: 1, evidence: "Invented" };
  assert.equal(
    groundedResult(row, clauses, text, "en", true).evidence,
    contract,
  );
  assert.equal(
    groundedResult({ ...row, clause: 0 }, clauses, text, "en", true).status,
    "uncertain",
  );
  assert.throws(
    () => groundedResult({ ...row, clause: 9 }, clauses, text, "en", true),
    /Evidence must match/,
  );
});

test("upgrading a v1 workspace adds only the project chat store", () => {
  const calls: [string, IDBObjectStoreParameters | undefined][] = [];
  const db = {
    createObjectStore(name: string, options?: IDBObjectStoreParameters) {
      calls.push([name, options]);
    },
  };
  upgradeWorkspace(db as Parameters<typeof upgradeWorkspace>[0], 1);
  assert.deepEqual(calls, [["chat", { keyPath: "project" }]]);
  calls.length = 0;
  upgradeWorkspace(db as Parameters<typeof upgradeWorkspace>[0], 0);
  assert.deepEqual(
    calls.map(([store]) => store),
    ["projects", "reviews", "settings", "chat"],
  );
});
