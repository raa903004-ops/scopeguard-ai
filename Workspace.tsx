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
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const statuses = {
  in_scope: "In scope",
  out_of_scope: "Out of scope",
  uncertain: "Uncertain",
};
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
const errorText = (err: unknown) =>
  err instanceof Error ? err.message : "The operation could not be completed.";
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
function email(r: Review) {
  const context = r.evidence
    ? "\n\nThe agreement states “" + r.evidence + "”"
    : "";
  const decision =
    r.status === "out_of_scope"
      ? "This work is outside our current agreement. My estimate is " +
        r.hours +
        " hours at " +
        money(r.rate) +
        "/hour, totaling " +
        money(revenue(r.hours, r.rate)) +
        ". Please confirm before I begin."
      : r.status === "in_scope"
        ? "This work falls within our current agreement."
        : "Could we clarify the deliverables before I proceed?";
  return (
    "Subject: Scope review — " +
    r.name +
    "\n\nHi,\n\nThanks for your request:\n“" +
    r.request +
    "”" +
    context +
    "\n\n" +
    decision +
    "\n\nBest regards"
  );
}

export default function Workspace({ page }: { page: string }) {
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
  const [activity, setActivity] = useState("");
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      if (active) setError(errorText(err));
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
  async function perform(label: string, fn: () => Promise<void>) {
    setActivity(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActivity("");
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
        throw new Error("Enter a project name and contract text.");
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
            ? await analyze(project.contract, request, (message, fraction) => {
                setActivity(message);
                setProgress(fraction);
              }, excerpt)
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
        };
        const db = await database();
        try {
          const tx = db.transaction(["projects", "reviews"], "readwrite");
          if (!(await tx.objectStore("projects").getKey(project.id))) {
            throw new Error(
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
    <Panel title="New project" icon={<Folder />}>
      <form onSubmit={saveProject}>
        <fieldset disabled={disabled}>
          <label>
            Project name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brand identity for Olive Studio"
            />
          </label>
          <label className="ws-upload">
            <Upload size={18} /> Import PDF or TXT
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
            Contract text
            <textarea
              required
              value={contract}
              rows={6}
              onChange={(e) => setContract(e.target.value)}
              placeholder="Paste your agreement or import a document above."
            />
          </label>
          <Button type="submit">
            <Plus size={16} /> Create project
          </Button>
        </fieldset>
      </form>
    </Panel>
  );
  const currentReviews = reviews.filter((r) => r.project === selected);
  return (
    <main className="ws">
      <div className="ws-top">
        <div>
          <small>LOCAL WORKSPACE</small>
          <h1>
            {page === "projects"
              ? "Projects"
              : page === "settings"
                ? "Settings"
                : "Dashboard"}
          </h1>
          <p>
            {page === "projects"
              ? "Manage the agreements behind your reviews."
              : page === "settings"
                ? "Control your rates and local data."
                : "Check client requests against your agreement."}
          </p>
        </div>
        <span className="ws-local">
          <ShieldCheck size={15} /> On this device
        </span>
      </div>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {(activity || notice) && (
        <p className="ws-notice" role="status">
          {activity || notice}
          {progress !== undefined && (
            <progress aria-label="Model download progress" value={progress} max={1} />
          )}
        </p>
      )}
      {!ready && !error && <p>Opening workspace…</p>}
      {page === "settings" ? (
        <div className="ws-grid">
          <Panel title="Review defaults" icon={<SlidersHorizontal />}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform("Saving rate…", async () => {
                  if (!validRate(rate))
                    throw new Error("Enter a valid USD hourly rate.");
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
                Hourly rate (USD)
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
              <Button disabled={disabled}>Save rate</Button>
            </form>
            <p>
              WebGPU{" "}
              {gpu === null
                ? "check in progress"
                : gpu
                  ? "available"
                  : "unavailable · manual review available"}
              .
            </p>
          </Panel>
          <Panel title="Workspace data" icon={<Archive />}>
            <p>
              Export all projects, contracts, review history and your saved
              hourly rate as JSON.
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
              <Download size={16} /> Export workspace
            </Button>
            <hr />
            {confirmDelete ? (
              <>
                <p>
                  Delete every saved contract, review and rate from this
                  browser? This is permanent.
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
                    Confirm deletion
                  </Button>
                  <button
                    disabled={disabled}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                disabled={disabled}
                className="ws-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete workspace data
              </button>
            )}
          </Panel>
        </div>
      ) : page === "projects" ? (
        <div className="ws-grid">
          {creator}
          <Panel
            title={"Saved projects · " + projects.length}
            icon={<Layers />}
          >
            {!projects.length && <p>Your saved agreements will appear here.</p>}
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
                  Review request
                </Button>
              </details>
            ))}
          </Panel>
        </div>
      ) : (
        <>
          <div className="ws-stats">
            {[
              ["Projects", projects.length],
              ["Saved reviews", reviews.length],
              [
                "Estimated extra work",
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
                      Cancel new project
                    </button>
                  )}
                </>
              ) : (
                <Panel title="Review a request" icon={<ScanLine />}>
                  <form onSubmit={saveReview}>
                    <fieldset disabled={disabled}>
                      <label>
                        Project
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
                        <summary>View contract</summary>
                        <pre>{project.contract}</pre>
                      </details>
                      <label>
                        Client request
                        <textarea
                          required
                          rows={3}
                          value={request}
                          onChange={(e) => setRequest(e.target.value)}
                          placeholder="Paste the client’s request…"
                        />
                      </label>
                      <label>
                        Review method
                        <select
                          value={mode}
                          onChange={(e) =>
                            setMode(e.target.value as typeof mode)
                          }
                        >
                          <option value="manual">Manual review</option>
                          <option value="ai" disabled={!gpu}>
                            Local AI {gpu ? "" : "· WebGPU unavailable"}
                          </option>
                        </select>
                      </label>
                      {mode === "manual" ? (
                        <>
                          <label>
                            Classification
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
                                  {v}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Exact contract quote
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
                            Reasoning
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
                            Estimated hours
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
                            The first analysis downloads the model. Inference runs
                            on this device.
                          </p>
                          <details>
                            <summary>Review a contract excerpt</summary>
                            <label>
                              Exact excerpt (optional)
                              <textarea
                                rows={4}
                                value={excerpt}
                                onChange={(e) => setExcerpt(e.target.value)}
                                placeholder="Copy relevant clauses from the contract above."
                              />
                            </label>
                          </details>
                        </>
                      )}
                      <label>
                        Hourly rate (USD)
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
                            ? "Analyze locally"
                            : "Save manual review"}
                        </Button>
                        <button type="button" onClick={() => setEditing(true)}>
                          New project
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </Panel>
              )}
            </div>
            <div>
              {detail && (
                <Panel title={statuses[detail.status]} icon={<FileText />}>
                  <small>
                    {detail.source} · {detail.name}
                  </small>
                  <p>{detail.request}</p>
                  {detail.evidence && (
                    <blockquote>{detail.evidence}</blockquote>
                  )}
                  <p>{detail.reasoning}</p>
                  <b>
                    {detail.hours} h × {money(detail.rate)} / h ={" "}
                    {money(revenue(detail.hours, detail.rate))}
                  </b>
                  <p>
                    Estimated extra work ·{" "}
                    {money(
                      detail.status === "out_of_scope"
                        ? revenue(detail.hours, detail.rate)
                        : 0,
                    )}
                  </p>
                  {!draft ? (
                    <Button onClick={() => setDraft(email(detail))}>
                      Generate client email
                    </Button>
                  ) : (
                    <>
                      <label>
                        Email draft
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
                        <Clipboard size={16} /> Copy email
                      </Button>
                    </>
                  )}
                </Panel>
              )}
              <Panel title="Review history" icon={<History />}>
                {currentReviews.length === 0 ? (
                  <p>Saved reviews for this project will appear here.</p>
                ) : (
                  currentReviews.map((r) => (
                    <button
                      disabled={disabled}
                      className="ws-history"
                      key={r.id}
                      onClick={() => openReview(r)}
                    >
                      <b>{statuses[r.status]}</b>
                      <span>{r.request}</span>
                      <small>
                        {r.source} · {new Date(r.created).toLocaleDateString()}
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
