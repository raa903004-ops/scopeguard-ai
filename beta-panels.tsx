import { useMemo, useState } from "react";
import { Button } from "./button";
import {
  allowsPayment,
  paymentToSave,
  compareContracts,
  workStatuses,
  type WorkRecord,
  type WorkStatus,
} from "./beta";
import { extraWork, reviewCurrency, type Review } from "./insights";
import { type Currency } from "./estimates";
import { type Translate } from "./i18n";
import type { Project } from "./workspace-db";

export function ProjectVersions({
  project,
  disabled,
  t,
  save,
}: {
  project: Project;
  disabled: boolean;
  t: Translate;
  save: (text: string) => void;
}) {
  const versions = project.versions ?? [{ text: project.contract }];
  const [from, setFrom] = useState<number>();
  const [to, setTo] = useState<number>();
  const [draft, setDraft] = useState(project.contract);
  const old = from ?? Math.max(0, versions.length - 2);
  const next = to ?? versions.length - 1;
  const before = versions[old].text;
  const after = versions[next].text;
  const changes = useMemo(
    () => compareContracts(before, after),
    [before, after],
  );

  return (
    <details className="ws-beta">
      <summary>
        {t("Contract versions")} · {versions.length}
      </summary>
      {versions.length > 1 && (
        <>
          <div className="ws-task-range">
            {(
              [
                [old, setFrom, "Compare from"],
                [next, setTo, "Compare to"],
              ] as const
            ).map(([value, setter, label]) => (
              <label key={label}>
                {t(label)}
                <select
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                >
                  {versions.map((_, index) => (
                    <option value={index} key={index}>
                      {t("Version")} {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {changes.length ? (
            <ul className="ws-diff">
              {changes.map(({ type, text }, index) => (
                <li data-change={type} key={index}>
                  {type !== "same" && (
                    <span
                      aria-label={t(type === "added" ? "Added" : "Removed")}
                    >
                      {type === "added" ? "+" : "−"}{" "}
                    </span>
                  )}
                  {text}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("No changes between these versions.")}</p>
          )}
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(draft);
          setFrom(undefined);
          setTo(undefined);
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            {t("Contract text")}
            <textarea
              rows={5}
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <Button type="submit">{t("Save new version")}</Button>
        </fieldset>
      </form>
    </details>
  );
}

export function ExtraWork({
  review,
  disabled,
  t,
  money,
  saveWork,
  saveDraft,
  generate,
  copy,
}: {
  review: Review;
  disabled: boolean;
  t: Translate;
  money: (value: number, currency: Currency) => string;
  saveWork: (work: WorkRecord) => void;
  saveDraft: (draft: string) => void;
  generate: () => string;
  copy: (draft: string) => void;
}) {
  const initial = review.work ?? {
    status: "detected",
    amount: extraWork(review),
    received: 0,
    currency: reviewCurrency(review),
  };
  const [status, setStatus] = useState<WorkStatus>(initial.status);
  const [amount, setAmount] = useState(String(initial.amount));
  const [received, setReceived] = useState(String(initial.received));
  const [draft, setDraft] = useState(review.agreement);
  const canEditReceived = allowsPayment(status) || initial.received > 0;
  return (
    <section className="ws-beta">
      <h3>
        {t("Extra work")} · {t(workStatuses[initial.status])}
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveWork({
            status,
            amount: Number(amount),
            received: paymentToSave(status, initial.received, received),
            currency: initial.currency,
          });
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            {t("Work status")}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkStatus)}
            >
              {Object.entries(workStatuses).map(([key, label]) => (
                <option value={key} key={key}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <div className="ws-task-range">
            <label>
              {t("Agreed amount")} ({initial.currency})
              <input
                type="number"
                min="0"
                max="10000000000"
                step=".01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {canEditReceived && (
              <label>
                {t("Received amount")} ({initial.currency})
                <input
                  type="number"
                  min={status === "paid" ? ".01" : "0"}
                  max="10000000000"
                  step=".01"
                  required
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                />
              </label>
            )}
          </div>
          <Button type="submit">{t("Save work status")}</Button>
        </fieldset>
      </form>
      {(review.evidence || draft !== undefined) && (
        <>
          <h3>{t("Change order")}</h3>
          <p>{t("Draft only. Review with the client before signing.")}</p>
          {draft !== undefined ? (
            <>
              <label>
                {t("Draft change order")}
                <textarea
                  rows={9}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </label>
              <div className="ws-actions">
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() => saveDraft(draft)}
                >
                  {t("Save draft")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => copy(draft)}
                >
                  {t("Copy draft")}
                </Button>
              </div>
            </>
          ) : (
            review.status === "out_of_scope" && (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => setDraft(generate())}
              >
                {t("Generate draft")}
              </Button>
            )
          )}
        </>
      )}
      {review.work &&
        review.work.status !== "detected" &&
        review.work.status !== "rejected" && (
          <small>
            {t("Agreed amount")} ·{" "}
            {money(review.work.amount, review.work.currency)}
          </small>
        )}
    </section>
  );
}
