import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { openDB, type DBSchema } from "idb";
import {
  Archive,
  Check,
  Clipboard,
  Download,
  FileText,
  Folder,
  History,
  Layers,
  Plus,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  analyze,
  hasGPU,
  readFile,
  revenue,
  validate,
  type Result,
} from "./engine";
import { Button } from "./button";
import {
  interpolate,
  locale,
  MessageError,
  translate,
  type Language,
  type Message,
} from "./i18n";
import "./workspace.css";

type Project = { id: string; name: string; contract: string };
type Review = Result & {
  id: string;
  project: string;
  name: string;
  contract: string;
  request: string;
  rate: number;
  created: string;
  source: "Manual" | "Local AI";
  reasoningLanguage?: Language;
};
interface Store extends DBSchema {
  projects: { key: string; value: Project };
  reviews: { key: string; value: Review };
  settings: { key: string; value: number };
}
const database = () =>
  openDB<Store>("scopeguard-workspace", 1, {
    upgrade(db) {
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("reviews", { keyPath: "id" });
      db.createObjectStore("settings");
    },
  });
const statuses = {
  in_scope: "In scope",
  out_of_scope: "Out of scope",
  uncertain: "Uncertain",
} as const;
const requiredField = "Fill in this field.";
const invalidNumber = "Enter a valid number within the allowed range.";
const blankReview: Result = {
  status: "uncertain",
  evidence: "",
  hours: 0,
  reasoning: "",
};
const validRate = (rate: string) =>
  rate.trim() !== "" &&
  Number.isFinite(Number(rate)) &&
  Number(rate) >= 0 &&
  Number(rate) <= 100000 &&
  /^\d+(\.\d{1,2})?$/.test(rate);
const errorKey = (err: unknown): Message =>
  err instanceof MessageError
    ? err.key
    : "The operation could not be completed.";
function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ws-panel">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
export default function Workspace({
  page,
  language,
}: {
  page: string;
  language: Language;
}) {
  const t = translate(language);
  const number = new Intl.NumberFormat(locale[language], {
    maximumFractionDigits: 6,
  });
  const money = (value: number) =>
    new Intl.NumberFormat(locale[language], {
      style: "currency",
      currency: "USD",
    }).format(value);
  function email(review: Review) {
    const subject = interpolate(t("Subject: Scope review — {project}"), {
      project: review.name,
    });
    const quote =
      review.evidence &&
      interpolate(t("The agreement states “{quote}”"), {
        quote: review.evidence,
      });
    const decision =
      review.status === "out_of_scope"
        ? interpolate(
            t(
              "This work is outside our current agreement. My estimate is {hours} h at {rate} per hour, totaling {total}. Please confirm before I begin.",
            ),
            {
              hours: number.format(review.hours),
              rate: money(review.rate),
              total: money(revenue(review.hours, review.rate)),
            },
          )
        : t(
            review.status === "in_scope"
              ? "This work falls within our current agreement."
              : "Could we clarify the deliverables before I proceed?",
          );
    return [
      subject,
      t("Hi,"),
      t("Thanks for your request:") + "\n“" + review.request + "”",
      quote,
      decision,
      t("Best regards"),
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  const [projects, setProjects] = useState<Project[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, select] = useState("");
  const project = projects.find((p) => p.id === selected);
  const [ready, setReady] = useState(false);
  const [rate, setRate] = useState("100");
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [contract, setContract] = useState("");
  const [request, setRequest] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [manual, setManual] = useState<Result>({ ...blankReview });
  const [activity, setActivity] = useState<Message>();
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<Message>();
  const [notice, setNotice] = useState<Message>();
  const [detail, setDetail] = useState<Review>();
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let active = true;
    const init = async () => {
      const db = await database();
      try {
        const [ps, rs, defaultRate] = await Promise.all([
          db.getAll("projects"),
          db.getAll("reviews"),
          db.get("settings", "rate"),
        ]);
        if (active) {
          setProjects(ps);
          select(ps[0]?.id || "");
          setReviews(rs.sort((a, b) => b.created.localeCompare(a.created)));
          setRate(String(defaultRate ?? 100));
          setReady(true);
        }
      } finally {
        db.close();
      }
    };
    void init().catch((err) => {
      if (active) setError(errorKey(err));
    });
    void hasGPU()
      .then((ok) => {
        if (active) {
          setGpu(ok);
          if (!ok) setMode("manual");
        }
      })
      .catch(() => {
        if (active) {
          setGpu(false);
          setMode("manual");
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function perform(label: Message, fn: () => Promise<void>) {
    setActivity(label);
    setError(undefined);
    setNotice(undefined);
    try {
      await fn();
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setActivity(undefined);
      setProgress(undefined);
    }
  }
  function openReview(r: Review) {
    setDetail(r);
    setDraft("");
  }
  function choose(p: Project) {
    select(p.id);
    setDetail(undefined);
    setDraft("");
    setRequest("");
    setExcerpt("");
    setManual({ ...blankReview });
    setEditing(false);
  }
  async function saveProject(event: FormEvent) {
    event.preventDefault();
    await perform("Saving project…", async () => {
      if (!name.trim() || !contract.trim())
        throw new MessageError("Enter a project name and contract text.");
      const p = { id: crypto.randomUUID(), name: name.trim(), contract };
      const db = await database();
      try {
        await db.put("projects", p);
      } finally {
        db.close();
      }
      setProjects((list) => [...list, p]);
      choose(p);
      setName("");
      setContract("");
      setNotice("Project saved on this device.");
    });
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!project || !request.trim() || !validRate(rate)) return;
    await perform(
      mode === "ai" ? "Preparing local model…" : "Saving review…",
      async () => {
        const output =
          mode === "ai"
            ? await analyze(
                project.contract,
                request,
                (message, fraction) => {
                  setActivity(message);
                  setProgress(fraction);
                },
                excerpt,
                language,
              )
            : validate(manual, project.contract);
        const r: Review = {
          ...validate(output, project.contract),
          id: crypto.randomUUID(),
          project: project.id,
          name: project.name,
          contract: project.contract,
          request: request.trim(),
          rate: Number(rate),
          created: new Date().toISOString(),
          source: mode === "ai" ? "Local AI" : "Manual",
          reasoningLanguage: mode === "ai" ? language : undefined,
        };
        const db = await database();
        try {
          const tx = db.transaction(["projects", "reviews"], "readwrite");
          if (!(await tx.objectStore("projects").getKey(project.id))) {
            throw new MessageError(
              "This project was deleted while the review was running.",
            );
          }
          await tx.objectStore("reviews").put(r);
          await tx.done;
        } finally {
          db.close();
        }
        setReviews((list) => [r, ...list]);
        openReview(r);
        setRequest("");
        setManual({ ...blankReview });
        setNotice("Review saved.");
      },
    );
  }
  const disabled = !ready || !!activity;
  const creator = (
    <Panel title={t("New project")} icon={<Folder />}>
      <form onSubmit={saveProject}>
        <fieldset disabled={disabled}>
          <label>
            {t("Project name")}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("e.g. Brand identity for Olive Studio")}
            />
          </label>
          <label className="ws-upload">
            <Upload size={18} /> {t("Import PDF or TXT")}
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f)
                  void perform("Reading contract…", async () => {
                    setContract(await readFile(f));
                  });
              }}
            />
          </label>
          <label>
            {t("Contract text")}
            <textarea
              required
              value={contract}
              rows={6}
              onChange={(e) => setContract(e.target.value)}
              placeholder={t(
                "Paste your agreement or import a document above.",
              )}
            />
          </label>
          <Button type="submit">
            <Plus size={16} /> {t("Create project")}
          </Button>
        </fieldset>
      </form>
    </Panel>
  );
  const feedback = activity ?? notice;
  const currentReviews = reviews.filter((r) => r.project === selected);
  return (
    <main
      className="ws"
      onInvalidCapture={(event) => {
        if (!(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        ))
          return;
        event.preventDefault();
        const field = event.target;
        if (field !== field.form?.querySelector(":invalid")) return;
        setNotice(undefined);
        setError(field.validity.valueMissing ? requiredField : invalidNumber);
        field.focus();
      }}
      onInputCapture={() => {
        if (error === requiredField || error === invalidNumber)
          setError(undefined);
      }}
    >
      <div className="ws-top">
        <div>
          <small>{t("LOCAL WORKSPACE")}</small>
          <h1>
            {page === "projects"
              ? t("Projects")
              : page === "settings"
                ? t("Settings")
                : t("Dashboard")}
          </h1>
          <p>
            {page === "projects"
              ? t("Manage the agreements behind your reviews.")
              : page === "settings"
                ? t("Control your rates and local data.")
                : t("Check client requests against your agreement.")}
          </p>
        </div>
        <span className="ws-local">
          <ShieldCheck size={15} /> {t("On this device")}
        </span>
      </div>
      {error && (
        <p className="ws-error" role="alert">
          {t(error)}
        </p>
      )}
      {feedback && (
        <p className="ws-notice" role="status">
          {t(feedback)}
          {progress !== undefined && (
            <progress
              aria-label={t("Model download progress")}
              value={progress}
              max={1}
            />
          )}
        </p>
      )}
      {!ready && !error && <p>{t("Opening workspace…")}</p>}
      {page === "settings" ? (
        <div className="ws-grid">
          <Panel title={t("Review defaults")} icon={<SlidersHorizontal />}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform("Saving rate…", async () => {
                  if (!validRate(rate))
                    throw new MessageError("Enter a valid USD hourly rate.");
                  const db = await database();
                  try {
                    await db.put("settings", Number(rate), "rate");
                  } finally {
                    db.close();
                  }
                  setNotice("Default rate saved.");
                });
              }}
            >
              <label>
                {t("Hourly rate (USD)")}
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step=".01"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </label>
              <Button disabled={disabled}>{t("Save rate")}</Button>
            </form>
            <p>
              {gpu === null
                ? t("WebGPU check in progress.")
                : gpu
                  ? t("WebGPU available.")
                  : t("WebGPU unavailable · manual review available.")}
            </p>
          </Panel>
          <Panel title={t("Workspace data")} icon={<Archive />}>
            <p>
              {t(
                "Export all projects, contracts, review history and your saved hourly rate as JSON.",
              )}
            </p>
            <Button
              disabled={disabled}
              onClick={() =>
                void perform("Exporting…", async () => {
                  const db = await database();
                  try {
                    const tx = db.transaction([
                      "projects",
                      "reviews",
                      "settings",
                    ]);
                    const [p, r, s] = await Promise.all([
                      tx.objectStore("projects").getAll(),
                      tx.objectStore("reviews").getAll(),
                      tx.objectStore("settings").get("rate"),
                    ]);
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              version: 1,
                              projects: p,
                              reviews: r,
                              rate: s ?? 100,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "scopeguard-workspace.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } finally {
                    db.close();
                  }
                })
              }
            >
              <Download size={16} /> {t("Export workspace")}
            </Button>
            <hr />
            {confirmDelete ? (
              <>
                <p>
                  {t(
                    "Delete every saved contract, review and rate from this browser? This is permanent.",
                  )}
                </p>
                <div className="ws-actions">
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      void perform("Deleting…", async () => {
                        const db = await database();
                        try {
                          const tx = db.transaction(
                            ["projects", "reviews", "settings"],
                            "readwrite",
                          );
                          await Promise.all([
                            tx.objectStore("projects").clear(),
                            tx.objectStore("reviews").clear(),
                            tx.objectStore("settings").clear(),
                            tx.done,
                          ]);
                        } finally {
                          db.close();
                        }
                        setProjects([]);
                        setReviews([]);
                        select("");
                        setDetail(undefined);
                        setRequest("");
                        setExcerpt("");
                        setDraft("");
                        setContract("");
                        setName("");
                        setManual({ ...blankReview });
                        setRate("100");
                        setConfirmDelete(false);
                        setNotice("Workspace data deleted.");
                      })
                    }
                  >
                    {t("Confirm deletion")}
                  </Button>
                  <button
                    disabled={disabled}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </>
            ) : (
              <button
                disabled={disabled}
                className="ws-danger"
                onClick={() => setConfirmDelete(true)}
              >
                {t("Delete workspace data")}
              </button>
            )}
          </Panel>
        </div>
      ) : page === "projects" ? (
        <div className="ws-grid">
          {creator}
          <Panel
            title={t("Saved projects") + " · " + projects.length}
            icon={<Layers />}
          >
            {!projects.length && (
              <p>{t("Your saved agreements will appear here.")}</p>
            )}
            {projects.map((p) => (
              <details key={p.id}>
                <summary>{p.name}</summary>
                <pre>{p.contract}</pre>
                <Button
                  disabled={disabled}
                  onClick={() => {
                    choose(p);
                    location.hash = "dashboard";
                  }}
                >
                  {t("Review request")}
                </Button>
              </details>
            ))}
          </Panel>
        </div>
      ) : (
        <>
          <div className="ws-stats">
            {[
              [t("Projects"), projects.length],
              [t("Saved reviews"), reviews.length],
              [
                t("Estimated extra work"),
                money(
                  reviews.reduce(
                    (n, r) =>
                      n +
                      (r.status === "out_of_scope"
                        ? revenue(r.hours, r.rate)
                        : 0),
                    0,
                  ),
                ),
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="ws-grid">
            <div>
              {!project || editing ? (
                <>
                  {creator}
                  {project && (
                    <button
                      disabled={disabled}
                      onClick={() => setEditing(false)}
                    >
                      {t("Cancel new project")}
                    </button>
                  )}
                </>
              ) : (
                <Panel title={t("Review a request")} icon={<ScanLine />}>
                  <form onSubmit={saveReview}>
                    <fieldset disabled={disabled}>
                      <label>
                        {t("Project")}
                        <select
                          value={selected}
                          onChange={(e) =>
                            choose(
                              projects.find((p) => p.id === e.target.value)!,
                            )
                          }
                        >
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <details>
                        <summary>{t("View contract")}</summary>
                        <pre>{project.contract}</pre>
                      </details>
                      <label>
                        {t("Client request")}
                        <textarea
                          required
                          rows={3}
                          value={request}
                          onChange={(e) => setRequest(e.target.value)}
                          placeholder={t("Paste the client’s request…")}
                        />
                      </label>
                      <label>
                        {t("Review method")}
                        <select
                          value={mode}
                          onChange={(e) =>
                            setMode(e.target.value as typeof mode)
                          }
                        >
                          <option value="manual">{t("Manual review")}</option>
                          <option value="ai" disabled={!gpu}>
                            {t("Local AI")}
                            {gpu ? "" : " · " + t("WebGPU unavailable")}
                          </option>
                        </select>
                      </label>
                      {mode === "manual" ? (
                        <>
                          <label>
                            {t("Classification")}
                            <select
                              value={manual.status}
                              onChange={(e) =>
                                setManual({
                                  ...manual,
                                  status: e.target.value as Result["status"],
                                })
                              }
                            >
                              {Object.entries(statuses).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {t(v)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("Exact contract quote")}
                            <textarea
                              required={manual.status !== "uncertain"}
                              value={manual.evidence}
                              onChange={(e) =>
                                setManual({
                                  ...manual,
                                  evidence: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("Reasoning")}
                            <textarea
                              required
                              value={manual.reasoning}
                              onChange={(e) =>
                                setManual({
                                  ...manual,
                                  reasoning: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("Estimated hours")}
                            <input
                              type="number"
                              required
                              min="0"
                              step=".01"
                              value={manual.hours}
                              onChange={(e) =>
                                setManual({
                                  ...manual,
                                  hours: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <p>
                            {t(
                              "The first analysis downloads the model. Inference runs on this device.",
                            )}
                          </p>
                          <details>
                            <summary>{t("Review a contract excerpt")}</summary>
                            <label>
                              {t("Exact excerpt (optional)")}
                              <textarea
                                rows={4}
                                value={excerpt}
                                onChange={(e) => setExcerpt(e.target.value)}
                                placeholder={t(
                                  "Copy relevant clauses from the contract above.",
                                )}
                              />
                            </label>
                          </details>
                        </>
                      )}
                      <label>
                        {t("Hourly rate (USD)")}
                        <input
                          required
                          type="number"
                          min="0"
                          max="100000"
                          step=".01"
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                        />
                      </label>
                      <div className="ws-actions">
                        <Button disabled={!validRate(rate)}>
                          {mode === "ai" ? (
                            <ScanLine size={16} />
                          ) : (
                            <Check size={16} />
                          )}{" "}
                          {mode === "ai"
                            ? t("Analyze locally")
                            : t("Save manual review")}
                        </Button>
                        <button type="button" onClick={() => setEditing(true)}>
                          {t("New project")}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </Panel>
              )}
            </div>
            <div>
              {detail && (
                <Panel title={t(statuses[detail.status])} icon={<FileText />}>
                  <small>
                    {t(detail.source)} · {detail.name}
                  </small>
                  <p>{detail.request}</p>
                  {detail.evidence && (
                    <blockquote>{detail.evidence}</blockquote>
                  )}
                  <p lang={detail.reasoningLanguage}>{detail.reasoning}</p>
                  <b>
                    {number.format(detail.hours)} {t("h")} ×{" "}
                    {money(detail.rate)} / {t("h")} ={" "}
                    {money(revenue(detail.hours, detail.rate))}
                  </b>
                  <p>
                    {t("Estimated extra work")} ·{" "}
                    {money(
                      detail.status === "out_of_scope"
                        ? revenue(detail.hours, detail.rate)
                        : 0,
                    )}
                  </p>
                  {!draft ? (
                    <Button onClick={() => setDraft(email(detail))}>
                      {t("Generate client email")}
                    </Button>
                  ) : (
                    <>
                      <label>
                        {t("Email draft")}
                        <textarea
                          rows={9}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                        />
                      </label>
                      <Button
                        onClick={() =>
                          void perform("Copying…", async () => {
                            await navigator.clipboard.writeText(draft);
                            setNotice("Email copied.");
                          })
                        }
                      >
                        <Clipboard size={16} /> {t("Copy email")}
                      </Button>
                    </>
                  )}
                </Panel>
              )}
              <Panel title={t("Review history")} icon={<History />}>
                {currentReviews.length === 0 ? (
                  <p>{t("Saved reviews for this project will appear here.")}</p>
                ) : (
                  currentReviews.map((r) => (
                    <button
                      disabled={disabled}
                      className="ws-history"
                      key={r.id}
                      onClick={() => openReview(r)}
                    >
                      <b>{t(statuses[r.status])}</b>
                      <span>{r.request}</span>
                      <small>
                        {t(r.source)} ·{" "}
                        {new Date(r.created).toLocaleDateString(
                          locale[language],
                        )}
                      </small>
                    </button>
                  ))
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
