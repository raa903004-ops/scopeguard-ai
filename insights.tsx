import { useEffect, useRef } from "react";
import { revenue, type Result } from "./engine";
import { locale, type Language, type Translate } from "./i18n";

export type Review = Result & {
  id: string;
  project: string;
  name: string;
  contract: string;
  request: string;
  rate: number;
  created: string;
  source: "Manual" | "Local AI";
  reasoningLanguage?: Language;
  synthetic?: boolean;
  edited?: boolean;
};

export const statuses = {
  in_scope: "In scope",
  out_of_scope: "Out of scope",
  uncertain: "Uncertain",
} as const;

export const extraWork = (review: Review) =>
  review.status === "out_of_scope" ? revenue(review.hours, review.rate) : 0;

const date = (value: string, language: Language) =>
  new Date(value).toLocaleDateString(locale[language]);

export function RevenueTrend({
  reviews,
  language,
  t,
  money,
}: {
  reviews: Review[];
  language: Language;
  t: Translate;
  money: (value: number) => string;
}) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const total = reviews.reduce((sum, review) => {
      const time = Date.parse(review.created);
      return time >= +start && time < +end ? sum + extraWork(review) : sum;
    }, 0);
    return { start, total };
  });
  const max = Math.max(...buckets.map(({ total }) => total));
  if (!max) return <p>{t("No out-of-scope estimates yet.")}</p>;
  const month = new Intl.DateTimeFormat(locale[language], {
    month: "short",
    year: "2-digit",
  });
  return (
    <ul className="ws-chart" aria-label={t("Estimated revenue trend")}>
      {buckets.map(({ start, total }) => (
        <li key={start.toISOString()}>
          <strong>{money(total)}</strong>
          <div className="ws-chart-track" aria-hidden="true">
            <span style={{ height: (total / max) * 100 + "%" }} />
          </div>
          <small>{month.format(start)}</small>
        </li>
      ))}
    </ul>
  );
}

export function RevenueByProject({
  reviews,
  t,
  money,
}: {
  reviews: Review[];
  t: Translate;
  money: (value: number) => string;
}) {
  const totals = new Map<string, { name: string; total: number }>();
  for (const review of reviews) {
    const total = (totals.get(review.project)?.total ?? 0) + extraWork(review);
    totals.set(review.project, { name: review.name, total });
  }
  const projects = [...totals.entries()]
    .filter(([, p]) => p.total > 0)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 5);
  if (!projects.length) return <p>{t("No out-of-scope estimates yet.")}</p>;
  const max = projects[0][1].total;
  return (
    <ul
      className="ws-project-chart"
      aria-label={t("Estimated revenue by project")}
    >
      {projects.map(([id, { name, total }]) => (
        <li key={id}>
          <span>{name}</span>
          <strong>{money(total)}</strong>
          <div aria-hidden="true">
            <span style={{ width: (100 * total) / max + "%" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ContractText({
  contract,
  evidence,
}: {
  contract: string;
  evidence?: string;
}) {
  const preview = useRef<HTMLPreElement>(null);
  const mark = useRef<HTMLElement>(null);
  const index = evidence ? contract.indexOf(evidence) : -1;
  useEffect(() => {
    if (preview.current)
      preview.current.scrollTop = Math.max(
        0,
        (mark.current?.offsetTop ?? 0) - 24,
      );
  }, [contract, evidence]);
  return (
    <pre className="ws-contract" ref={preview} tabIndex={0}>
      {index < 0 || !evidence ? (
        contract
      ) : (
        <>
          {contract.slice(0, index)}
          <mark ref={mark}>{evidence}</mark>
          {contract.slice(index + evidence.length)}
        </>
      )}
    </pre>
  );
}

export function exportCsv(reviews: Review[], t: Translate, language: Language) {
  const rows = [
    [
      t("Project"),
      t("Date"),
      t("Source"),
      t("Sample project"),
      t("Client request"),
      t("Classification"),
      t("Exact contract quote"),
      t("Reasoning"),
      t("Estimated hours"),
      t("Hourly rate (USD)"),
      t("Estimated extra work") + " (USD)",
    ],
    ...reviews.map((r) => [
      r.name,
      date(r.created, language),
      t(r.source) + (r.edited ? " · " + t("Edited manually") : ""),
      r.synthetic ? t("Sample project") : "",
      r.request,
      t(statuses[r.status]),
      r.evidence,
      r.reasoning,
      r.hours,
      r.rate,
      extraWork(r).toFixed(2),
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((field) => {
          let value = String(field);
          if (/^\s*[=+@-]|^[\t\r\n]/.test(value)) value = "'" + value;
          return '"' + value.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "scopeguard-findings.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FindingsReport({
  reviews,
  name,
  t,
  language,
  money,
}: {
  reviews: Review[];
  name: string;
  t: Translate;
  language: Language;
  money: (value: number) => string;
}) {
  return (
    <article className="ws-print">
      <header>
        <strong>ScopeGuard AI</strong>
        <h1>{t("Findings report")}</h1>
        <h2>{name}</h2>
        <p>
          {t("Generated on this device")} ·{" "}
          {date(new Date().toISOString(), language)}
        </p>
      </header>
      <p>{t("Report estimates are based on saved reviews.")}</p>
      <p>
        <b>
          {t("Estimated extra work")} ·{" "}
          {money(reviews.reduce((sum, r) => sum + extraWork(r), 0))}
        </b>
      </p>
      {reviews.map((r) => (
        <section key={r.id}>
          <h3>
            {t(statuses[r.status])} · {date(r.created, language)}
          </h3>
          <p>
            {t(r.source)}
            {r.edited && " · " + t("Edited manually")}
            {r.synthetic && " · " + t("Sample project")}
          </p>
          <p>
            <b>{t("Client request")}</b>
            <br />
            {r.request}
          </p>
          {r.evidence && <blockquote>{r.evidence}</blockquote>}
          <p>{r.reasoning}</p>
          <p>
            {r.hours} {t("h")} × {money(r.rate)} / {t("h")} ·{" "}
            {t("Estimated extra work")} {money(extraWork(r))}
          </p>
        </section>
      ))}
    </article>
  );
}
