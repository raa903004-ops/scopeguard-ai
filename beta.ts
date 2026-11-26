import { validate, revenue } from "./engine.ts";
import { currencies, type Currency } from "./estimates.ts";
import { MessageError } from "./i18n.ts";
import type { Review } from "./insights.tsx";
import type { Project, ChatTurn } from "./workspace-db.ts";

export const workStatuses = {
  detected: "Detected",
  approved: "Approved",
  completed: "Completed",
  invoiced: "Invoiced",
  paid: "Paid",
  rejected: "Rejected",
} as const;

export type WorkStatus = keyof typeof workStatuses;
export type ContractVersion = { text: string; created?: string };
export type WorkRecord = {
  status: WorkStatus;
  amount: number;
  received: number;
  currency: Currency;
};
const agreed = (status: WorkStatus) =>
  status !== "detected" && status !== "rejected";
export const allowsPayment = (status: WorkStatus) =>
  status === "invoiced" || status === "paid";

const validMoney = (value: unknown, max = 10_000_000_000): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= max &&
  Math.abs(Math.round(value * 100) - value * 100) < 0.001;
const isCurrency = (value: unknown): value is Currency =>
  currencies.some((code) => code === value);

export function validWork(value: unknown): value is WorkRecord {
  if (!value || typeof value !== "object") return false;
  const { status, amount, received, currency } = value as WorkRecord;
  return (
    Object.hasOwn(workStatuses, status) &&
    isCurrency(currency) &&
    validMoney(amount) &&
    validMoney(received) &&
    (status !== "paid" || received > 0)
  );
}

export function financialTotals(reviews: readonly Review[]) {
  return currencies
    .map((currency) => {
      let potential = 0,
        approved = 0,
        received = 0;
      for (const review of reviews) {
        if (review.synthetic) continue;
        const work = review.work;
        if (work?.currency === currency)
          received += Math.round(work.received * 100);
        if (work?.currency === currency && agreed(work.status)) {
          approved += Math.round(work.amount * 100);
        } else if (
          (!work || work.status === "detected") &&
          (review.currency ?? "USD") === currency &&
          review.status === "out_of_scope"
        ) {
          potential += Math.round(revenue(review.hours, review.rate) * 100);
        }
      }
      return {
        currency,
        potential: potential / 100,
        approved: approved / 100,
        received: received / 100,
      };
    })
    .filter((row) => row.potential || row.approved || row.received);
}

type Change = { type: "same" | "added" | "removed"; text: string };
export function compareContracts(before: string, after: string): Change[] {
  const segments = (text: string) => text.split(/(?<=[.!?;])(?= +\S)|(?<=\n)/u);
  const a = segments(before),
    b = segments(after);
  if (before === after) return [];
  let from = 0,
    endA = a.length,
    endB = b.length;
  while (from < endA && from < endB && a[from] === b[from]) from++;
  while (endA > from && endB > from && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const old = a.slice(from, endA),
    next = b.slice(from, endB);
  const changes: Change[] = [];
  if (old.length * next.length > 200_000) {
    return [
      ...old.map((text): Change => ({ type: "removed", text })),
      ...next.map((text): Change => ({ type: "added", text })),
    ];
  }
  const matrix = Array.from(
    { length: old.length + 1 },
    () => new Uint32Array(next.length + 1),
  );
  for (let i = old.length - 1; i >= 0; i--)
    for (let j = next.length - 1; j >= 0; j--)
      matrix[i][j] =
        old[i] === next[j]
          ? 1 + matrix[i + 1][j + 1]
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  let i = 0,
    j = 0;
  while (i < old.length || j < next.length) {
    if (i < old.length && j < next.length && old[i] === next[j]) {
      changes.push({ type: "same", text: old[i++] });
      j++;
    } else if (
      i < old.length &&
      (j >= next.length || matrix[i + 1][j] >= matrix[i][j + 1])
    )
      changes.push({ type: "removed", text: old[i++] });
    else changes.push({ type: "added", text: next[j++] });
  }
  return changes;
}

type Backup = {
  projects: Project[];
  reviews: Review[];
  chats: { project: string; turns: ChatTurn[] }[];
  rate?: number;
  currency?: Currency;
};
const invalid = () =>
  new MessageError("Invalid or unsupported ScopeGuard backup.");
const record = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw invalid();
  return input as Record<string, unknown>;
};
const text = (value: unknown, allowBlank = false): string => {
  if (typeof value !== "string" || (!allowBlank && !value.trim()))
    throw invalid();
  return value;
};
const maybeDate = (value: unknown) => {
  const date = text(value);
  if (!Number.isFinite(Date.parse(date))) throw invalid();
  return date;
};
const flag = (value: unknown) => {
  if (value !== undefined && typeof value !== "boolean") throw invalid();
  return value;
};

export function parseBackup(raw: string): Backup {
  try {
    const data = record(JSON.parse(raw));
    if (
      ![1, 2, 3].includes(data.version as number) ||
      !Array.isArray(data.projects) ||
      !Array.isArray(data.reviews) ||
      (data.chats !== undefined && !Array.isArray(data.chats))
    )
      throw invalid();
    const seen = new Map<string, Project>();
    const projects = data.projects.map((input: unknown): Project => {
      const row = record(input);
      const project: Project = {
        id: text(row.id),
        name: text(row.name),
        contract: text(row.contract),
        synthetic: flag(row.synthetic),
      };
      if (seen.has(project.id)) throw invalid();
      if (row.versions !== undefined) {
        if (!Array.isArray(row.versions) || !row.versions.length)
          throw invalid();
        project.versions = row.versions.map((item: unknown) => {
          const version = record(item);
          return {
            text: text(version.text),
            created:
              version.created === undefined
                ? undefined
                : maybeDate(version.created),
          };
        });
        if (project.versions.at(-1)?.text !== project.contract) throw invalid();
      }
      seen.set(project.id, project);
      return project;
    });
    const reviewIds = new Set<string>();
    const reviews = data.reviews.map((input: unknown): Review => {
      const row = record(input);
      const id = text(row.id),
        project = text(row.project),
        contract = text(row.contract);
      if (
        reviewIds.has(id) ||
        !seen.has(project) ||
        !validMoney(row.rate, 100000) ||
        (row.currency !== undefined && !isCurrency(row.currency)) ||
        (row.source !== "Manual" && row.source !== "Local AI") ||
        (row.reasoningLanguage !== undefined &&
          row.reasoningLanguage !== "en" &&
          row.reasoningLanguage !== "ru") ||
        (row.work !== undefined && !validWork(row.work))
      )
        throw invalid();
      const agreement = seen.get(project)!;
      if (!(
        agreement.versions?.some((version) => version.text === contract) ??
        agreement.contract === contract
      ))
        throw invalid();
      reviewIds.add(id);
      return {
        ...validate(row, contract),
        id,
        project,
        name: text(row.name),
        contract,
        request: text(row.request),
        rate: row.rate,
        currency: row.currency,
        created: maybeDate(row.created),
        source: row.source,
        reasoningLanguage: row.reasoningLanguage,
        synthetic: seen.get(project)?.synthetic || flag(row.synthetic),
        edited: flag(row.edited),
        work: row.work,
        agreement:
          row.agreement === undefined ? undefined : text(row.agreement, true),
      };
    });
    const chatIds = new Set<string>();
    const chats = (data.chats ?? []).map((input: unknown) => {
      const row = record(input);
      const project = text(row.project),
        agreement = seen.get(project);
      if (!agreement || chatIds.has(project) || !Array.isArray(row.turns))
        throw invalid();
      chatIds.add(project);
      const contracts = agreement.versions?.map((version) => version.text) ?? [
        agreement.contract,
      ];
      const turns = row.turns.map((input: unknown): ChatTurn => {
        const turn = record(input),
          answer = record(turn.answer);
        const version = turn.version ?? 1;
        if (
          typeof version !== "number" ||
          !Number.isInteger(version) ||
          version < 1 ||
          version > contracts.length
        )
          throw invalid();
        return {
          question: text(turn.question),
          answer: validate(answer, contracts[version - 1]),
          version,
        };
      });
      return { project, turns };
    });
    if (
      (data.rate !== undefined && !validMoney(data.rate, 100000)) ||
      (data.currency !== undefined && !isCurrency(data.currency))
    )
      throw invalid();
    return {
      projects,
      reviews,
      chats,
      rate: data.rate,
      currency: data.currency,
    };
  } catch {
    throw invalid();
  }
}
