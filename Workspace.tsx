import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
  isModelLoaded,
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
import {
  ContractText,
  exportCsv,
  extraWork,
  FindingsReport,
  RevenueTrend,
  RevenueByProject,
  statuses,
  type Review,
} from "./insights";
import {
  WorkspaceNavigation,
  workspaceViews,
  type WorkspaceView,
} from "./workspace-nav";
import "./workspace.css";

type Project = {
  id: string;
  name: string;
  contract: string;
  synthetic?: boolean;
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
const reviewError = (err: unknown) =>
  err instanceof MessageError
    ? err
    : new MessageError("The operation could not be completed.");
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
  sampleMode = false,
}: {
  page: WorkspaceView;
  language: Language;
  sampleMode?: boolean;
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
  const [mode, setMode] = useState<"ai" | "manual" | "batch">("ai");
  const [manual, setManual] = useState<Result>({ ...blankReview });
  const [activity, setActivity] = useState<Message>();
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<MessageError>();
  const [notice, setNotice] = useState<Message>();
  const [detail, setDetail] = useState<Review>();
  const [draft, setDraft] = useState("");
  const findingAnchor = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current !== page)
      heading.current?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [page]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editFinding, setEditFinding] = useState<{
    result: Result;
    rate: string;
  }>();
  const [projectQuery, setProjectQuery] = useState("");
  const [projectStatus, setProjectStatus] = useState<Result["status"] | "">("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState<Result["status"] | "">("");
  const [question, setQuestion] = useState("");
  const [chats, setChats] = useState<
    Record<string, { question: string; answer: Result }[]>
  >({});
  const [batchStep, setBatchStep] = useState<{
    current: number;
    total: number;
  }>();
  const [batchFailed, setBatchFailed] = useState<number>();
  const [retryReview, setRetryReview] = useState(false);
  const activeAnalysis = useRef<AbortController | null>(null);
  const [stopping, setStopping] = useState(false);
  const turns = chats[selected] ?? [];
  const realProjectIds = new Set(
    projects.filter((p) => !p.synthetic).map((p) => p.id),
  );
  const realReviews = reviews.filter(
    (row) => !row.synthetic && realProjectIds.has(row.project),
  );
  const updateProgress = (message: Message, fraction?: number) => {
    if (activeAnalysis.current?.signal.aborted) return;
    setActivity(message);
    setProgress(fraction);
  };
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
      if (active) setError(reviewError(err));
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
      activeAnalysis.current?.abort();
    };
  }, []);
  async function perform(label: Message, fn: () => Promise<void>) {
    setActivity(label);
    setError(undefined);
    setNotice(undefined);
    try {
      await fn();
    } catch (err) {
      setError(reviewError(err));
    } finally {
      setActivity(undefined);
      setProgress(undefined);
      setBatchStep(undefined);
      activeAnalysis.current = null;
      setStopping(false);
    }
  }
  function openReview(r: Review) {
    setDetail(r);
    setEditFinding(undefined);
    setDraft("");
  }
  function inspectReview(review: Review) {
    const target = projects.find((p) => p.id === review.project);
    if (!target) return;
    if (selected !== target.id) choose(target);
    openReview(review);
    if (page !== "analysis") location.hash = "analysis";
    else findingAnchor.current?.focus();
  }
  function choose(p: Project) {
    select(p.id);
    setEditFinding(undefined);
    setQuestion("");
    setBatchFailed(undefined);
    setRetryReview(false);
    setHistoryStatus("");
    setHistoryQuery("");
    setDetail(undefined);
    setDraft("");
    setRequest("");
    setExcerpt("");
    setManual({ ...blankReview });
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
  async function loadSample() {
    await perform("Saving project…", async () => {
      const sample = projects.find((p) => p.synthetic) ?? {
        id: crypto.randomUUID(),
        name: t("Sample website project"),
        contract: t(
          "The project includes design and delivery of one homepage. Additional pages require a separate estimate. Two rounds of homepage revisions are included.",
        ),
        synthetic: true,
      };
      if (!projects.some((p) => p.id === sample.id)) {
        const db = await database();
        try {
          await db.put("projects", sample);
        } finally {
          db.close();
        }
        setProjects((list) => [...list, sample]);
      }
      choose(sample);
      setRequest(t("Could you also design a separate pricing page?"));
      setMode(gpu === false ? "manual" : "ai");
      setNotice(
        "Sample loaded. Run local analysis to generate the first finding.",
      );
      if (page !== "analysis") location.hash = "analysis";
    });
  }

  async function storeReview(review: Review, update = false) {
    const db = await database();
    try {
      const tx = db.transaction(["projects", "reviews"], "readwrite");
      const [existingProject, existingReview] = await Promise.all([
        tx.objectStore("projects").getKey(review.project),
        update ? tx.objectStore("reviews").getKey(review.id) : undefined,
      ]);
      if (!existingProject || (update && !existingReview))
        throw new MessageError(
          "This project was deleted while the review was running.",
        );
      await tx.objectStore("reviews").put(review);
      await tx.done;
    } finally {
      db.close();
    }
    setReviews((list) =>
      update
        ? list.map((r) => (r.id === review.id ? review : r))
        : [review, ...list],
    );
    openReview(review);
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (
      !project ||
      !request.trim() ||
      !validRate(rate) ||
      (mode !== "manual" && !gpu)
    )
      return;
    setRetryReview(false);
    setBatchFailed(undefined);
    await perform(
      mode === "manual" ? "Saving review…" : "Preparing local model…",
      async () => {
        const controller =
          mode !== "manual" ? new AbortController() : undefined;
        activeAnalysis.current = controller ?? null;
        const requests =
          mode === "batch"
            ? request
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
            : [request.trim()];
        if (requests.length > 10)
          throw new MessageError("Enter 1 to 10 requests, one per line.");
        for (let index = 0; index < requests.length; index++) {
          const item = requests[index];
          if (mode === "batch")
            setBatchStep({ current: index + 1, total: requests.length });
          try {
            const output =
              mode === "manual"
                ? manual
                : await analyze(
                    project.contract,
                    item,
                    updateProgress,
                    excerpt,
                    language,
                    { signal: controller?.signal },
                  );
            await storeReview({
              ...validate(output, project.contract),
              id: crypto.randomUUID(),
              project: project.id,
              name: project.name,
              contract: project.contract,
              request: item,
              rate: Number(rate),
              created: new Date().toISOString(),
              source: mode === "manual" ? "Manual" : "Local AI",
              reasoningLanguage: mode === "manual" ? undefined : language,
              synthetic: project.synthetic,
            });
          } catch (error) {
            if (mode !== "manual") setRetryReview(true);
            if (mode === "batch") {
              setBatchFailed(index + 1);
              setRequest(requests.slice(index).join("\n"));
            }
            throw error;
          }
        }
        setRequest("");
        setManual({ ...blankReview });
        setNotice(mode === "batch" ? "Batch reviews saved." : "Review saved.");
      },
    );
  }

  async function saveFinding(event: FormEvent) {
    event.preventDefault();
    if (!editFinding || !detail) return;
    await perform("Saving review…", async () => {
      if (!validRate(editFinding.rate))
        throw new MessageError("Enter a valid USD hourly rate.");
      const output = validate(editFinding.result, detail.contract);
      await storeReview(
        {
          ...detail,
          ...output,
          rate: Number(editFinding.rate),
          edited: true,
          reasoningLanguage:
            output.reasoning === detail.reasoning
              ? detail.reasoningLanguage
              : undefined,
        },
        true,
      );
      setNotice("Findings updated.");
    });
  }

  async function askContract(event: FormEvent) {
    event.preventDefault();
    if (!project || !gpu || !question.trim()) return;
    await perform("Preparing local model…", async () => {
      const asked = question.trim();
      const controller = new AbortController();
      activeAnalysis.current = controller;
      const answer = await analyze(
        project.contract,
        asked,
        updateProgress,
        excerpt,
        language,
        {
          previousQuestions: turns.slice(-2).map((turn) => turn.question),
          signal: controller.signal,
        },
      );
      setChats((all) => ({
        ...all,
        [project.id]: [...(all[project.id] ?? []), { question: asked, answer }],
      }));
      setQuestion("");
    });
  }

  function resultFields(value: Result, onChange: (result: Result) => void) {
    return (
      <>
        <label>
          {t("Classification")}
          <select
            value={value.status}
            onChange={(e) =>
              onChange({ ...value, status: e.target.value as Result["status"] })
            }
          >
            {Object.entries(statuses).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Exact contract quote")}
          <textarea
            required={value.status !== "uncertain"}
            value={value.evidence}
            onChange={(e) => onChange({ ...value, evidence: e.target.value })}
          />
        </label>
        <label>
          {t("Reasoning")}
          <textarea
            required
            value={value.reasoning}
            onChange={(e) => onChange({ ...value, reasoning: e.target.value })}
          />
        </label>
        <label>
          {t("Estimated hours")}
          <input
            type="number"
            required
            min="0"
            max="100000"
            step="any"
            value={value.hours}
            onChange={(e) =>
              onChange({ ...value, hours: Number(e.target.value) })
            }
          />
        </label>
      </>
    );
  }
  function statusFilter(
    value: string,
    onChange: (status: Result["status"] | "") => void,
  ) {
    return (
      <label>
        {t("Filter by review status")}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Result["status"] | "")}
        >
          <option value="">{t("All statuses")}</option>
          {Object.entries(statuses).map(([key, label]) => (
            <option key={key} value={key}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function rateField(value: string, onChange: (newRate: string) => void) {
    return (
      <label>
        {t("Hourly rate (USD)")}
        <input
          type="number"
          required
          min="0"
          max="100000"
          step=".01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  const disabled = !ready || !!activity;
  const projectPicker = (
    <label className="ws-project-picker">
      {t("Project")}
      <select
        value={selected}
        disabled={disabled}
        onChange={(e) => {
          const picked = projects.find((p) => p.id === e.target.value);
          if (picked) choose(picked);
        }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.synthetic ? " · " + t("Sample project") : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const excerptField = (
    <details>
      <summary>{t("Review a contract excerpt")}</summary>
      <label>
        {t("Exact excerpt (optional)")}
        <textarea
          rows={4}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder={t("Copy relevant clauses from the contract above.")}
        />
      </label>
    </details>
  );
  const missingProject = (
    <Panel title={t("Projects")} icon={<Folder />}>
      <p>{t("Create or select a project to continue.")}</p>
      <a className="sg-button sg-solid" href="#projects">
        {t("Projects")}
      </a>
    </Panel>
  );
  function historyItem(r: Review) {
    return (
      <button
        disabled={disabled}
        className="ws-history"
        key={r.id}
        aria-current={page === "analysis" && detail?.id === r.id}
        onClick={() => inspectReview(r)}
      >
        <b>{t(statuses[r.status])}</b>
        <span>{r.request}</span>
        <small>
          {r.name} · {t(r.source)}
          {r.edited && " · " + t("Edited manually")}
          {r.synthetic && " · " + t("Sample project")} ·{" "}
          {new Date(r.created).toLocaleDateString(locale[language])}
        </small>
      </button>
    );
  }

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
  const onboarding = (
    <Panel
      title={t(sampleMode ? "Live AI demo" : "Try a sample contract")}
      icon={<FileText />}
    >
      <p>
        {t(
          sampleMode
            ? "Use a fictional contract and run a real review with WebLLM on your device. The first run downloads model weights."
            : "Start with a fictional agreement and a client request. Run your first local analysis when ready.",
        )}
      </p>
      <Button disabled={disabled} onClick={() => void loadSample()}>
        {t("Load sample contract")}
      </Button>
    </Panel>
  );
  const statistics = (
    <div className="ws-stats">
      {[
        [
          t("Projects"),
          number.format(projects.filter((p) => !p.synthetic).length),
        ],
        [t("Saved reviews"), number.format(realReviews.length)],
        [
          t("Out-of-scope reviews"),
          number.format(
            realReviews.filter((r) => r.status === "out_of_scope").length,
          ),
        ],
        [
          t("Estimated extra work"),
          money(realReviews.reduce((sum, r) => sum + extraWork(r), 0)),
        ],
      ].map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
  const feedback = activity ?? notice;
  const modelState =
    activity && activeAnalysis.current
      ? "busy"
      : gpu === null
        ? "checking"
        : gpu === false
          ? "manual"
          : isModelLoaded()
            ? "ready"
            : "idle";
  const modelLabels = {
    busy: "Local AI running",
    checking: "Checking WebGPU",
    manual: "Manual review only",
    ready: "AI model loaded",
    idle: "AI ready to load",
  } as const;
  const currentReviews = reviews.filter((r) => r.project === selected);
  const projectMatches = projects.filter(
    (p) =>
      p.name
        .toLocaleLowerCase()
        .includes(projectQuery.trim().toLocaleLowerCase()) &&
      (!projectStatus ||
        reviews.some((r) => r.project === p.id && r.status === projectStatus)),
  );
  const historyMatches = currentReviews.filter(
    (r) =>
      (!historyStatus || r.status === historyStatus) &&
      [r.request, r.evidence, r.reasoning].some((value) =>
        value
          .toLocaleLowerCase()
          .includes(historyQuery.trim().toLocaleLowerCase()),
      ),
  );
  return (
    <div className="ws-shell">
      <WorkspaceNavigation page={page} t={t} />
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
          setError(
            new MessageError(
              field.validity.valueMissing ? requiredField : invalidNumber,
            ),
          );
          field.focus();
        }}
        onInputCapture={() => {
          if (error?.key === requiredField || error?.key === invalidNumber)
            setError(undefined);
        }}
      >
        <div className="ws-top">
          <div>
            <small>{t("LOCAL WORKSPACE")}</small>
            <h1 ref={heading} tabIndex={-1}>
              {t(workspaceViews[page].label)}
            </h1>
            <p>{t(workspaceViews[page].description)}</p>
          </div>
          <div className="ws-badges">
            <span className="ws-local">
              <ShieldCheck size={15} /> {t("On this device")}
            </span>
            <span
              className="ws-model"
              data-state={modelState}
              aria-live="polite"
            >
              <i aria-hidden="true" />
              {t(modelLabels[modelState])}
            </span>
          </div>
        </div>
        {error && (
          <p className="ws-error" role="alert">
            {t(error.key)}
            {batchFailed && (
              <span className="ws-error-detail">
                {interpolate(
                  t(
                    "Batch stopped at request {number}. Saved earlier results. Remaining requests are ready to retry.",
                  ),
                  { number: number.format(batchFailed) },
                )}
              </span>
            )}
            {error.detail && (
              <span className="ws-error-detail">{error.detail}</span>
            )}
          </p>
        )}
        {activity && activeAnalysis.current && (
          <Button
            type="button"
            variant="ghost"
            disabled={stopping}
            onClick={() => {
              activeAnalysis.current?.abort();
              setStopping(true);
              setProgress(undefined);
              setActivity("Stopping analysis…");
            }}
          >
            {t("Stop analysis")}
          </Button>
        )}
        {feedback && (
          <p className="ws-notice" role="status">
            {t(feedback)}
            {batchStep && (
              <>
                {" "}
                ·{" "}
                {interpolate(t("Working on request {current} of {total}"), {
                  current: number.format(batchStep.current),
                  total: number.format(batchStep.total),
                })}
              </>
            )}
            {progress !== undefined && (
              <span className="ws-progress">
                <progress
                  aria-label={t("Model download progress")}
                  value={progress}
                  max={1}
                />
                {new Intl.NumberFormat(locale[language], {
                  style: "percent",
                }).format(progress)}
              </span>
            )}
          </p>
        )}
        {!ready && !error && <p>{t("Opening workspace…")}</p>}

        {ready && page === "settings" && (
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
                          setChats({});
                          setQuestion("");
                          setEditFinding(undefined);
                          setBatchFailed(undefined);
                          setRetryReview(false);
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
        )}
        {ready && page === "projects" && (
          <div className="ws-grid">
            {creator}
            <Panel
              title={t("Saved projects") + " · " + projects.length}
              icon={<Layers />}
            >
              {!projects.length && (
                <p>{t("Your saved agreements will appear here.")}</p>
              )}
              <label>
                {t("Search projects")}
                <input
                  type="search"
                  value={projectQuery}
                  onChange={(e) => setProjectQuery(e.target.value)}
                />
              </label>
              {statusFilter(projectStatus, setProjectStatus)}
              {projects.length > 0 && projectMatches.length === 0 && (
                <p>{t("No matching projects.")}</p>
              )}
              {projectMatches.map((p) => (
                <details key={p.id}>
                  <summary>
                    {p.name}
                    {p.synthetic && " · " + t("Sample project")}
                  </summary>
                  <small>
                    {t("Saved reviews")} ·{" "}
                    {reviews.filter((r) => r.project === p.id).length}
                  </small>
                  <pre>{p.contract}</pre>
                  <Button
                    disabled={disabled}
                    onClick={() => {
                      choose(p);
                      location.hash = "analysis";
                    }}
                  >
                    {t("Review request")}
                  </Button>
                </details>
              ))}
            </Panel>
          </div>
        )}
        {ready && page === "dashboard" && (
          <>
            {!projects.length && onboarding}
            {statistics}
            <Panel title={t("Recent reviews")} icon={<History />}>
              <div className="ws-actions">
                <a href="#projects" className="sg-button sg-outline">
                  {t("Projects")}
                </a>
                <a href="#analysis" className="sg-button sg-solid">
                  {t("Start analysis")}
                </a>
              </div>
              {reviews.length ? (
                reviews.slice(0, 5).map(historyItem)
              ) : (
                <p>{t("Start a review to build your history.")}</p>
              )}
            </Panel>
          </>
        )}
        {ready && page === "analytics" && (
          <>
            {statistics}
            <div className="ws-grid">
              <Panel title={t("Estimated revenue trend")} icon={<ScanLine />}>
                <p>
                  {t(
                    "Out-of-scope estimates from saved reviews. Sample projects are excluded.",
                  )}
                </p>
                <RevenueTrend
                  reviews={realReviews}
                  language={language}
                  t={t}
                  money={money}
                />
              </Panel>
              <Panel
                title={t("Estimated revenue by project")}
                icon={<Layers />}
              >
                <p>{t("Top five projects by estimated extra work.")}</p>
                <RevenueByProject reviews={realReviews} t={t} money={money} />
              </Panel>
            </div>
          </>
        )}
        {ready && page === "analysis" && (
          <>
            {sampleMode && onboarding}
            {!project ? (
              <Panel title={t("New project")} icon={<Folder />}>
                <p>
                  {t("Choose or create a project before starting a review.")}
                </p>
                <a className="sg-button sg-solid" href="#projects">
                  {t("Create project")}
                </a>
                {!sampleMode && (
                  <a className="ws-inline-link" href="#demo">
                    {t("Try the AI demo")}
                  </a>
                )}
              </Panel>
            ) : (
              <>
                {projectPicker}
                <div className="ws-grid ws-analysis">
                  <div className="ws-contract-column">
                    <Panel title={t("View contract")} icon={<FileText />}>
                      {detail?.evidence && (
                        <p>
                          {t("Evidence is highlighted in the saved contract.")}
                        </p>
                      )}
                      <ContractText
                        contract={detail?.contract ?? project.contract}
                        evidence={detail?.evidence}
                      />
                    </Panel>
                  </div>
                  <div className="ws-analysis-content">
                    <Panel title={t("Review a request")} icon={<ScanLine />}>
                      {project.synthetic && <p>{t("Sample project")}</p>}
                      <form onSubmit={saveReview}>
                        <fieldset disabled={disabled}>
                          <label>
                            {t(
                              mode === "batch"
                                ? "One client request per line (up to 10)."
                                : "Client request",
                            )}
                            <textarea
                              required
                              rows={mode === "batch" ? 6 : 3}
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
                              <option value="manual">
                                {t("Manual review")}
                              </option>
                              <option value="batch" disabled={!gpu}>
                                {t("Batch review")}
                              </option>
                              <option value="ai" disabled={!gpu}>
                                {t("Local AI")}
                                {gpu ? "" : " · " + t("WebGPU unavailable")}
                              </option>
                            </select>
                          </label>
                          {mode === "manual" ? (
                            resultFields(manual, setManual)
                          ) : (
                            <>
                              <p>
                                {t(
                                  "The initial model download can take several minutes or longer. Keep this tab open. Later runs reuse cached files.",
                                )}
                              </p>
                              {excerptField}
                            </>
                          )}
                          {rateField(rate, setRate)}
                          <div className="ws-actions">
                            <Button
                              disabled={
                                !validRate(rate) || (mode !== "manual" && !gpu)
                              }
                            >
                              {mode !== "manual" ? (
                                <ScanLine size={16} />
                              ) : (
                                <Check size={16} />
                              )}{" "}
                              {t(
                                mode === "manual"
                                  ? "Save manual review"
                                  : retryReview
                                    ? "Retry local analysis"
                                    : mode === "batch"
                                      ? "Analyze batch"
                                      : "Analyze locally",
                              )}
                            </Button>
                            {retryReview && mode !== "manual" && (
                              <button
                                type="button"
                                onClick={() => setMode("manual")}
                              >
                                {t("Switch to manual review")}
                              </button>
                            )}
                          </div>
                        </fieldset>
                      </form>
                    </Panel>
                    <div
                      ref={findingAnchor}
                      tabIndex={-1}
                      className="ws-finding-anchor"
                    >
                      {detail ? (
                        <Panel
                          title={t(statuses[detail.status])}
                          icon={<FileText />}
                        >
                          <small>
                            {t(detail.source)} · {detail.name}
                            {detail.synthetic && " · " + t("Sample project")}
                            {detail.edited && " · " + t("Edited manually")}
                          </small>
                          <p>{detail.request}</p>
                          {detail.evidence && (
                            <blockquote>{detail.evidence}</blockquote>
                          )}
                          <p lang={detail.reasoningLanguage}>
                            {detail.reasoning}
                          </p>
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

                          {!editFinding && (
                            <Button
                              variant="ghost"
                              disabled={disabled}
                              onClick={() =>
                                setEditFinding({
                                  result: detail,
                                  rate: String(detail.rate),
                                })
                              }
                            >
                              {t("Edit findings")}
                            </Button>
                          )}
                          {editFinding ? (
                            <form onSubmit={saveFinding}>
                              <fieldset disabled={disabled}>
                                {resultFields(editFinding.result, (value) =>
                                  setEditFinding({
                                    ...editFinding,
                                    result: value,
                                  }),
                                )}
                                {rateField(editFinding.rate, (value) =>
                                  setEditFinding({
                                    ...editFinding,
                                    rate: value,
                                  }),
                                )}
                                <div className="ws-actions">
                                  <Button>{t("Save changes")}</Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setEditFinding(undefined)}
                                  >
                                    {t("Cancel")}
                                  </Button>
                                </div>
                              </fieldset>
                            </form>
                          ) : !draft ? (
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
                      ) : (
                        <Panel
                          title={t("Contract and findings")}
                          icon={<FileText />}
                        >
                          <p>
                            {t(
                              "Select a review to see its findings and evidence.",
                            )}
                          </p>
                        </Panel>
                      )}
                    </div>
                    <Panel title={t("Review history")} icon={<History />}>
                      <a className="ws-inline-link" href="#reports">
                        {t("Open reports")}
                      </a>
                      {currentReviews.length > 0 && (
                        <>
                          <label>
                            {t("Search review history")}
                            <input
                              type="search"
                              value={historyQuery}
                              onChange={(e) => setHistoryQuery(e.target.value)}
                            />
                          </label>
                          {statusFilter(historyStatus, setHistoryStatus)}
                        </>
                      )}
                      {currentReviews.length === 0 ? (
                        <p>
                          {t(
                            "Saved reviews for this project will appear here.",
                          )}
                        </p>
                      ) : historyMatches.length === 0 ? (
                        <p>{t("No matching reviews.")}</p>
                      ) : (
                        historyMatches.map(historyItem)
                      )}
                    </Panel>
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {ready &&
          page === "chat" &&
          (project ? (
            <>
              {projectPicker}
              <div className="ws-grid ws-analysis">
                <div className="ws-contract-column">
                  <Panel title={t("View contract")} icon={<FileText />}>
                    <ContractText
                      contract={project.contract}
                      evidence={turns.at(-1)?.answer.evidence}
                    />
                  </Panel>
                </div>
                <Panel title={t("Contract chat")} icon={<ScanLine />}>
                  <p>
                    {t(
                      "Ask about the selected contract. The local model must cite a clause for supported answers.",
                    )}
                  </p>
                  {gpu === false && (
                    <p>{t("WebGPU is unavailable. Use manual review.")}</p>
                  )}
                  {turns.length > 0 && (
                    <ol className="ws-chat" aria-live="polite">
                      {turns.map((turn, index) => (
                        <li key={index}>
                          <b>{turn.question}</b>
                          <p>
                            {turn.answer.evidence
                              ? turn.answer.reasoning
                              : t(
                                  "No supporting clause was verified for this answer.",
                                )}
                          </p>
                          {turn.answer.evidence && (
                            <blockquote>{turn.answer.evidence}</blockquote>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  <form onSubmit={askContract}>
                    <fieldset disabled={disabled || !gpu}>
                      {excerptField}
                      <label>
                        {t("Question about this contract")}
                        <textarea
                          required
                          rows={2}
                          maxLength={1500}
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                        />
                      </label>
                      <div className="ws-actions">
                        <Button>{t("Ask locally")}</Button>
                        {turns.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setChats((all) => ({ ...all, [selected]: [] }))
                            }
                          >
                            {t("Clear chat")}
                          </Button>
                        )}
                      </div>
                    </fieldset>
                  </form>
                </Panel>
              </div>
            </>
          ) : (
            missingProject
          ))}
        {ready &&
          page === "reports" &&
          (project ? (
            <>
              {projectPicker}
              <Panel title={t("Findings report")} icon={<FileText />}>
                <p>{t("Choose a project to export its saved findings.")}</p>
                {!currentReviews.length ? (
                  <p>{t("No saved findings for this project yet.")}</p>
                ) : (
                  <>
                    <p>
                      {t("Saved reviews")} ·{" "}
                      {number.format(currentReviews.length)}
                      <br />
                      {t("Estimated extra work")} ·{" "}
                      {money(
                        currentReviews.reduce(
                          (sum, r) => sum + extraWork(r),
                          0,
                        ),
                      )}
                    </p>
                    <div className="ws-actions">
                      <Button
                        disabled={disabled}
                        onClick={() => exportCsv(currentReviews, t, language)}
                      >
                        {t("Export CSV")}
                      </Button>
                      <Button
                        disabled={disabled}
                        onClick={() => window.print()}
                      >
                        {t("Print / Save PDF")}
                      </Button>
                    </div>
                    {currentReviews.map(historyItem)}
                  </>
                )}
              </Panel>
              <FindingsReport
                reviews={currentReviews}
                name={project.name}
                t={t}
                language={language}
                money={money}
              />
            </>
          ) : (
            missingProject
          ))}
      </main>
    </div>
  );
}
