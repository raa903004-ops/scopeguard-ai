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
const billingUnit = /^(?:\/\s*|per\s+|(?:в|за)\s+)/iu;
const hourlyUnit = /^(?:hours?|hrs?|h|час(?:а|ов)?|ч)$/iu;
const nonUSD =
  /\b(?:CAD|AUD|NZD|HKD|SGD|MXN|ARS|CLP|COP|TWD|BBD|BSD|BMD|BND|FJD|GYD|JMD|KYD|NAD|SBD|SRD|TTD|XCD|ZWL)\b|(?:Canadian|Australian|New Zealand|Hong Kong|Singapore)\s+dollars?/iu;
const namedHourly = new RegExp(
  String.raw`(?:\bhourly\s+rate|почасовая\s+ставка)\s*(?:[:=—–]|\bis\b)?\s*${money}`,
  "giu",
);

function parseAmount(value: string) {
  const decimal = /[,.](\d{1,2})$/.exec(value);
  const whole = (decimal ? value.slice(0, -decimal[0].length) : value).replace(
    /[\u00a0\u202f]/g,
    " ",
  );
  if (!/^\d+$/.test(whole) && !/^\d{1,3}([ ,.])\d{3}(?:\1\d{3})*$/.test(whole))
    return NaN;
  return Number(
    whole.replace(/[ ,.]/g, "") + (decimal ? "." + decimal[1] : ""),
  );
}

export function extractHourlyRate(
  contract: string,
): { rate: number; currency: Currency | null; evidence: string } | undefined {
  const candidates = new Map<
    string,
    { rate: number; currency: Currency | null; evidence: string }
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
      /[-−–—]\s*$/.test(before) ||
      /\d\s*(?:USD|EUR|RUB|[$€₽])?\s*[-–—]\s*$/iu.test(before) ||
      /^\s*[-–—]\s*(?:[$€₽]|USD|EUR|RUB)?\s*\d/iu.test(after)
    )
      continue;
    const rest = after.trimStart();
    const unit = billingUnit.exec(rest);
    if (
      unit &&
      !hourlyUnit.test(rest.slice(unit[0].length).match(/^\p{L}+/u)?.[0] ?? "")
    )
      continue;
    const tokenText = match[1] ?? match[4];
    if (tokenText === "$" && nonUSD.test(contract)) continue;
    const token = (match[1] ?? match[4]).toUpperCase();
    const rate = parseAmount(match[2] ?? match[3]);
    const currency: Currency | null =
      token === "EUR" || token === "€"
        ? "EUR"
        : token === "RUB" || token === "₽" || token.startsWith("РУБ")
          ? "RUB"
          : token === "$"
            ? null
            : "USD";
    if (rate > 0 && rate <= 100000)
      candidates.set((currency ?? "$") + rate, {
        rate,
        currency,
        evidence: match[0],
      });
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}
