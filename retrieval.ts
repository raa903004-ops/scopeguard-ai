export type ScopeStatus = "in_scope" | "out_of_scope" | "uncertain";
export type Classification = {
  status: ScopeStatus;
  evidence: string;
  method: "rules" | "model";
};

const stop = new Set(
  "a an and are as at be by can could do for from i if in is it may of on or our please shall should the their this to we will with would you your add provide perform include need request under contract scope work who what how when whether also the service services из и в во на для по с со к как не ли ли нужно можно ли мы вы ваш наши договор договору работы работа прошу пожалуйста добавьте предоставьте включите выполните услуга услуги".split(
    " ",
  ),
);

const norm = (value: string) =>
  value
    .toLocaleLowerCase("en")
    .replaceAll("ё", "е")
    .replace(/\bweb hosting\b/g, "hosting")
    .replace(/[’']/g, "");
function terms(text: string) {
  return new Set(
    (norm(text).match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((term) => term.length > 1 && !stop.has(term))
      .map((term) =>
        /^[a-z]{5,}s$/.test(term) && !term.endsWith("ss")
          ? term.slice(0, -1)
          : foldRussian(term),
      ),
  );
}
const foldRussian = (term: string) =>
  /^[а-я]{5,}$/u.test(term) ? term.replace(/[аяую]$/u, "") : term;
const overlap = (a: Set<string>, b: Set<string>) =>
  [...a].filter((word) => b.has(word));
const exactTopic = (value: string) =>
  norm(value)
    .replace(/[.!?;]+$/u, "")
    .replace(/^\s*(?:\d+[.)]\s*|(?:the|a|an)\s+)/iu, "")
    .trim()
    .replace(/\s+/g, " ");

const comparableTopic = (value: string) =>
  exactTopic(value).split(" ").map(foldRussian).join(" ");

export function contractClauses(text: string) {
  return text
    .split(/(?<=[.!?;])\s+|\r?\n/u)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
}

export function requestParts(request: string) {
  return request
    .split(/(?:\s*(?:;|\r?\n|\+)\s*|\s+(?:and|plus|и|а также)\s+)/iu)
    .filter((part) => terms(part).size);
}

export function retrieveClauses(
  clauses: readonly string[],
  query: string,
  limit = 6,
) {
  const tokens = terms(query);
  if (!tokens.size) return [];
  const indexed = clauses.map((text, index) => ({
    text,
    index,
    seen: terms(text),
  }));
  const counts = new Map<string, number>();
  for (const { seen } of indexed)
    for (const token of overlap(tokens, seen))
      counts.set(token, (counts.get(token) ?? 0) + 1);
  return indexed
    .map(({ text, index, seen }) => {
      const matches = overlap(tokens, seen);
      const score =
        matches.reduce(
          (sum, token) => sum + Math.log1p(clauses.length / counts.get(token)!),
          0,
        ) / Math.sqrt(Math.max(1, seen.size / 8));
      return { text, index, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ text }) => text);
}

const uncertain = (method: Classification["method"]): Classification => ({
  status: "uncertain",
  evidence: "",
  method,
});
const explicit =
  /^(.*?)\s+(?:(?:is|are)\s+(excluded|not included|not covered|billed separately|included|covered)(?:\s+(?:in|from|by)\s+(?:the\s+)?(?:(?:scope of work|scope|agreement|contract)))?|(?:does not form part of the scope)|(не входит в объем работ|входит в объем работ|оплачивается отдельно))\s*[.!]?$/iu;
const ask =
  /^(?:(?:please\s+|(?:can|could|would) you\s+)?(?:add|provide|include|perform|deliver|set up)\s+|(?:пожалуйста,?\s+|прошу\s+)?(?:добавьте|предоставьте|включите|выполните)\s+)(.+?)[.?!]?$/iu;
const negative =
  /\b(?:excluded|not included|not covered|billed separately|out of scope|separate estimate|exclusions?|not (?:form )?part of)\b|исключ[её]н|не входит|не включ[её]н|оплачивается отдельно/iu;
const positive =
  /\b(?:is included|are included|is covered|are covered|includes|part of the (?:deliverables|scope)|will deliver)\b|(?<!не\s)(?:входит в объ[её]м|включ[её]н в объ[её]м)/iu;
const conditional =
  /\b(?:if|unless|subject to|may|upon|optional|provided that|to be agreed|up to|no more than)\b|при условии|по согласованию|может|не более|в зависимости/iu;

export function directClassification(
  clauses: readonly string[],
  request: string,
): Classification | undefined {
  const parts = requestParts(request);
  if (!parts.length) return uncertain("rules");
  const matches: Classification[] = [];
  for (const part of parts) {
    const wording = norm(part).trim();
    const requested = ask.exec(wording)?.[1];
    if (
      !requested ||
      /\d|,|\b(?:not|except|unless|instead)\b|(?:^|\s)не\s/u.test(requested)
    )
      return;
    const topic = exactTopic(requested);
    const tokens = terms(topic);
    const related = clauses.filter(
      (clause) => overlap(tokens, terms(clause)).length === tokens.size,
    );
    if (!tokens.size) return;
    if (
      related.some((part) => negative.test(part)) &&
      related.some((part) => positive.test(part) && !negative.test(part))
    )
      return uncertain("rules");
    if (related.length !== 1) return;
    const evidence = related[0];
    const declaration = explicit.exec(
      norm(evidence).replace(/^\d+[.)]\s*/, ""),
    );
    if (
      !declaration ||
      comparableTopic(declaration[1]) !== comparableTopic(topic)
    )
      return;
    matches.push({
      status:
        negative.test(evidence) || /does not form part/i.test(evidence)
          ? "out_of_scope"
          : "in_scope",
      evidence,
      method: "rules",
    });
  }
  if (matches.length !== 1)
    return matches.some((item) => item.status !== matches[0].status)
      ? uncertain("rules")
      : undefined;
  return matches[0];
}

export function validateClassification(
  raw: unknown,
  passages: readonly string[],
  request: string,
  retry: boolean,
): Classification {
  if (!raw || typeof raw !== "object")
    throw new SyntaxError("Invalid classification");
  const { status, clause } = raw as { status?: unknown; clause?: unknown };
  if (
    typeof clause !== "number" ||
    !Number.isInteger(clause) ||
    clause < 0 ||
    clause > passages.length ||
    (status !== "in_scope" &&
      status !== "out_of_scope" &&
      status !== "uncertain")
  )
    throw new SyntaxError("Invalid classification schema");
  if (status === "uncertain") return uncertain("model");
  const evidence = passages[clause - 1];
  const proof = evidence && terms(evidence);
  const related =
    proof &&
    requestParts(request).every((part) => {
      const words = terms(part);
      return (
        overlap(words, proof).length >= Math.max(1, Math.ceil(words.size * 0.6))
      );
    });
  const conflicts =
    evidence &&
    ((status === "in_scope" && negative.test(evidence)) ||
      (status === "out_of_scope" &&
        positive.test(evidence) &&
        !negative.test(evidence)));
  // A partial, conditional, unrelated or contradictory clause cannot establish the whole request.
  const explicitSupport =
    status === "in_scope"
      ? positive.test(evidence ?? "")
      : negative.test(evidence ?? "");
  const mixed = evidence && positive.test(evidence) && negative.test(evidence);
  if (
    !evidence ||
    !related ||
    !explicitSupport ||
    conflicts ||
    mixed ||
    conditional.test(evidence)
  ) {
    if (!retry) throw new SyntaxError("Unsupported classification");
    return uncertain("model");
  }
  return { status, evidence, method: "model" };
}
