export const currencies = ["USD", "EUR", "RUB"] as const;
export type Currency = (typeof currencies)[number];

export type TaskEstimate = {
  task: string;
  minHours: number;
  maxHours: number;
  assumptions: string;
};

export function hourRange(tasks: readonly TaskEstimate[]) {
  let min = 0;
  let max = 0;
  for (const task of tasks) {
    min += Math.round(task.minHours * 100);
    max += Math.round(task.maxHours * 100);
  }
  return { min: min / 100, max: max / 100, midpoint: (min + max) / 200 };
}

const amount = String.raw`(\d+(?:[ \u00a0\u202f.,]\d+)*)`;
const currency = String.raw`(USD|US\$|EUR|RUB|руб\.?|[$€₽])`;
const money = String.raw`(?<![\p{L}\d])(?:${currency}\s*${amount}|${amount}\s*${currency})(?![\p{L}\d])`;
const hourly = new RegExp(
  String.raw`${money}\s*(?:/\s*(?:hours?|hrs?|h|час(?:а|ов)?|ч)|per\s+hour|(?:в|за)\s+час)(?![\p{L}\d])`,
  "giu",
);
const namedHourly = new RegExp(
  String.raw`(?:\bhourly\s+rate|почасовая\s+ставка)\s*(?:[:=—–-]|\bis\b)?\s*${money}`,
  "giu",
);

function parseAmount(value: string) {
  const clean = value.replace(/[ \u00a0\u202f]/g, "");
  const cents = /[,.](\d{1,2})$/.exec(clean);
  const whole = (cents ? clean.slice(0, -cents[0].length) : clean).replace(
    /[,.]/g,
    "",
  );
  return Number(whole + (cents ? "." + cents[1] : ""));
}

export function extractHourlyRate(
  contract: string,
): { rate: number; currency: Currency; evidence: string } | undefined {
  const candidates = new Map<
    string,
    { rate: number; currency: Currency; evidence: string }
  >();
  for (const match of [
    ...contract.matchAll(hourly),
    ...contract.matchAll(namedHourly),
  ]) {
    const before = contract.slice(Math.max(0, match.index - 24), match.index);
    const after = contract.slice(
      match.index + match[0].length,
      match.index + match[0].length + 24,
    );
    if (
      /[-–—]$/.test(before) ||
      /\d\s*(?:USD|EUR|RUB|[$€₽])?\s*[-–—]\s*$/iu.test(before) ||
      /^\s*[-–—]\s*(?:[$€₽]|USD|EUR|RUB)?\s*\d/iu.test(after)
    )
      continue;
    const token = (match[1] ?? match[4]).toUpperCase();
    const rate = parseAmount(match[2] ?? match[3]);
    const currency: Currency =
      token === "EUR" || token === "€"
        ? "EUR"
        : token === "RUB" || token === "₽" || token.startsWith("РУБ")
          ? "RUB"
          : "USD";
    if (rate > 0 && rate <= 100000)
      candidates.set(currency + rate, { rate, currency, evidence: match[0] });
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}
