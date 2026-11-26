import { classifyContract } from "./engine";
import { scopeCases } from "./scope-cases";

export async function runScopeBenchmark() {
  const results = [];
  for (const [id, contract, request, expected, citation] of scopeCases) {
    try {
      const result = await classifyContract(contract, request, () => {});
      results.push({
        id,
        expected,
        actual: result.status,
        method: result.method,
        exactEvidence: citation
          ? result.evidence === citation
          : !result.evidence,
      });
    } catch (error) {
      results.push({
        id,
        expected,
        actual: "error",
        method: "model",
        exactEvidence: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
