import { useRef, useState } from "react";
import {
  Braces,
  Check,
  CircleHelp,
  FileText,
  Fingerprint,
  Focus,
  Layers2,
  ListFilter,
  LockKeyhole,
  MessageSquareText,
  Play,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { locale, translate, type Language, type Translate } from "./i18n";
import "./landing.css";

const examplesFor = (t: Translate) => [
  {
    name: t("Additional page"),
    request: t("Could you also design a pricing page for the launch?"),
    clause: t("Additional pages require a separate estimate."),
    verdict: t("Out of scope"),
    reason: t(
      "The agreement covers the homepage only. A pricing page adds a separate deliverable.",
    ),
    hours: 6,
    icon: TriangleAlert,
  },
  {
    name: t("Revision"),
    request: t(
      "Can we use our first revision to adjust the homepage typography?",
    ),
    clause: t("Two rounds of homepage revisions are included."),
    verdict: t("In scope"),
    reason: t(
      "The client is requesting the first of two included revision rounds.",
    ),
    hours: 0,
    icon: Check,
  },
  {
    name: t("Handoff"),
    request: t("Can you walk our developers through the final files?"),
    clause: t("Final design files will be delivered in Figma."),
    verdict: t("Uncertain"),
    reason: t(
      "The agreement specifies a file handoff but leaves a live walkthrough undefined.",
    ),
    hours: 0,
    icon: CircleHelp,
  },
];
export default function Landing({ language }: { language: Language }) {
  const t = translate(language);
  const examples = examplesFor(t);
  const [index, setIndex] = useState(0);
  const [roi, setRoi] = useState({ requests: "3", hours: "2", rate: "100" });
  const [rate, setRate] = useState("125");
  const demo = useRef<HTMLElement>(null);
  const example = examples[index];
  const VerdictIcon = example.icon;
  const amount = new Intl.NumberFormat(locale[language], {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format((Number(rate) || 0) * example.hours);
  return (
    <main className="sg-land">
      <section className="sg-hero">
        <div className="sg-hero-copy">
          <span className="sg-eyebrow">
            <span /> {t("LOCAL-FIRST SCOPE INTELLIGENCE")}
          </span>
          <h1>
            {t("Catch out-of-scope work")}
            <br />
            <em>{t("before it goes unpaid.")}</em>
          </h1>
          <p>
            {t(
              "Compare client requests to your contract, find the exact clause, and estimate what to charge for extra work.",
            )}
          </p>
          <div className="sg-actions">
            <a className="nav-cta" href="#dashboard">
              {t("Try free")}
            </a>
            <a className="sg-demo-button" href="#demo">
              <Play size={15} />
              {t("Try the AI demo")}
            </a>
            <button
              className="sg-examples-link"
              onClick={() => {
                demo.current?.scrollIntoView({
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "instant"
                    : "smooth",
                });
                demo.current?.focus({ preventScroll: true });
              }}
            >
              {t("View prepared examples")}
            </button>
          </div>
          <div className="sg-private">
            <LockKeyhole size={14} /> {t("Private by design")}
            <i /> {t("No account or card required")}
          </div>
        </div>
        <div
          className="sg-art"
          role="img"
          aria-label={t(
            "Illustrative contract scan highlighting an additional-page clause",
          )}
        >
          <div className="sg-surface">
            <div className="sg-art-label">
              <Focus size={14} /> {t("CONTRACT INSPECTOR")}
            </div>
            <div className="sg-sheet sg-shadow-paper" />
            <div className="sg-sheet sg-document">
              <div className="sg-paper-meta">
                FIELDWORK STUDIO <span>{t("DOCUMENT / 01")}</span>
              </div>
              <strong>
                {t("Statement")}
                <br />
                {t("of Work")}
                <span>.</span>
              </strong>
              <div className="sg-paper-sub">
                {t("Website design engagement")}
              </div>
              <div className="sg-paper-rule" />
              <b>02 &nbsp; {t("Scope of services")}</b>
              <p>{t("Design and delivery of one marketing homepage.")}</p>
              <mark>{t("Additional pages require a separate estimate.")}</mark>
              <div className="sg-faux-line" />
              <div className="sg-faux-line short" />
            </div>
            <div className="sg-scan" />
            <div className="sg-tag">
              <ScanLine size={18} />
              <div>
                <small>{t("CLAUSE DETECTED")}</small>
                <b>{t("Scope boundary")}</b>
              </div>
            </div>
            <div className="sg-art-foot">
              <Fingerprint size={16} /> {t("LOCAL DOCUMENT SCAN")}{" "}
              <span>{t("ILLUSTRATION")}</span>
            </div>
          </div>
        </div>
      </section>
      <section
        className="sg-demo"
        ref={demo}
        tabIndex={-1}
        id="interactive-demo"
      >
        <div className="sg-section-heading">
          <div>
            <span className="sg-eyebrow">
              <span /> {t("INTERACTIVE DEMO")}
            </span>
            <h2>{t("Inside a scope review.")}</h2>
          </div>
          <p>
            {t("Explore a sample request and its contract evidence.")}
            <br />
            {t("Synthetic examples with prepared reviews.")}
          </p>
        </div>
        <div className="sg-console">
          <div className="sg-toolbar">
            <span>
              <Layers2 size={17} /> Fieldwork Studio <i>/</i>{" "}
              {t("Website redesign")}
            </span>
            <small>{t("Demo project")}</small>
          </div>
          <div className="sg-console-body">
            <div className="sg-rail">
              <h3>
                <ListFilter size={15} /> {t("Client requests")}
              </h3>
              {examples.map((x, i) => (
                <button
                  key={x.name}
                  aria-pressed={i === index}
                  className={i === index ? "active" : ""}
                  onClick={() => setIndex(i)}
                >
                  <MessageSquareText size={15} />
                  {x.name}
                </button>
              ))}
            </div>
            <div className="sg-case" aria-live="polite">
              <h3>{t("Client request")}</h3>
              <p className="sg-request">“{example.request}”</p>
              <h3>
                <FileText size={14} /> {t("Contract evidence")}
              </h3>
              <blockquote>{example.clause}</blockquote>
            </div>
            <div className="sg-result" aria-live="polite">
              <h3>
                <Braces size={14} /> {t("Prepared review")}
              </h3>
              <b className={"sg-verdict verdict-" + index}>
                <VerdictIcon size={14} />
                {example.verdict}
              </b>
              <p>{example.reason}</p>
              {index === 0 && (
                <div className="sg-est">
                  <label>
                    {t("Hourly rate ($)")}
                    <input
                      type="number"
                      min="0"
                      max="100000"
                      step=".01"
                      value={rate}
                      onChange={(e) =>
                        setRate(
                          e.target.value === ""
                            ? ""
                            : String(
                                Math.min(
                                  100000,
                                  Math.max(0, Number(e.target.value)),
                                ),
                              ),
                        )
                      }
                    />
                  </label>
                  <div>
                    <small>{t("6 sample hours")}</small>
                    <strong>{amount}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="sg-feature-section">
        <h2>{t("Spot extra work before it goes unbilled.")}</h2>
        <p>
          {t(
            "See the clause, estimate the work and send a clear response to your client.",
          )}
        </p>
        <div className="sg-feature-grid">
          {(
            [
              [
                FileText,
                "Cite the agreement",
                "Highlight the exact clause behind each supported finding.",
              ],
              [
                Layers2,
                "Track potential revenue",
                "Review estimates across projects and export a report.",
              ],
              [
                LockKeyhole,
                "Keep client documents local",
                "Contracts, analysis and history stay in your browser.",
              ],
            ] as const
          ).map(([Icon, title, copy]) => (
            <article key={title}>
              <Icon size={20} />
              <h3>{t(title)}</h3>
              <p>{t(copy)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="sg-feature-section">
        <h2>{t("Built for client work")}</h2>
        <div className="sg-feature-grid">
          {(
            [
              ["Agencies", "Check extra pages, formats and revision rounds."],
              [
                "Consultancies",
                "Check whether workshops and new deliverables are covered.",
              ],
              [
                "Freelancers",
                "Estimate change requests before agreeing to more work.",
              ],
            ] as const
          ).map(([title, copy]) => (
            <article key={title}>
              <h3>{t(title)}</h3>
              <p>{t(copy)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="sg-feature-section sg-roi">
        <div>
          <h2>{t("Estimate your monthly opportunity")}</h2>
          <p>{t("Illustrative estimate based on your inputs.")}</p>
          <div className="sg-roi-fields">
            {(
              [
                ["requests", "Out-of-scope requests per month", 10000, "1"],
                ["hours", "Average hours per request", 1000, ".01"],
                ["rate", "Hourly rate (USD)", 100000, ".01"],
              ] as const
            ).map(([key, label, max, step]) => (
              <label key={key}>
                {t(label)}
                <input
                  type="number"
                  min="0"
                  max={max}
                  step={step}
                  value={roi[key]}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRoi((current) => ({
                      ...current,
                      [key]:
                        value === ""
                          ? ""
                          : String(Math.max(0, Math.min(max, Number(value)))),
                    }));
                  }}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="sg-roi-total">
          <small>{t("Potential monthly revenue")}</small>
          <output>
            {new Intl.NumberFormat(locale[language], {
              style: "currency",
              currency: "USD",
            }).format(
              Number(roi.requests) * Number(roi.hours) * Number(roi.rate),
            )}
          </output>
        </div>
      </section>
      <section
        className="sg-feature-section sg-privacy"
        id="hardware-requirements"
      >
        <h2>{t("Hardware requirements")}</h2>
        <p>
          {t(
            "Local AI needs WebGPU and hardware acceleration in a compatible browser on HTTPS or localhost. Check WebGPU in Settings before downloading.",
          )}
        </p>
        <p>
          {t(
            "The default model downloads about 265 MiB of weights, plus runtime files. Some fallback models are larger. Allow additional browser storage and GPU memory.",
          )}
        </p>
        <p>
          {t(
            "Manual review works without a compatible GPU. PDFs need a text layer.",
          )}
        </p>
      </section>
      <section className="sg-feature-section sg-faq">
        <h2>{t("Frequently asked questions")}</h2>
        {(
          [
            [
              "Where are my contracts stored?",
              "Contracts and history are stored in this browser. You can export or delete them in Settings.",
            ],
            [
              "Do I need a GPU?",
              "Local AI requires a compatible WebGPU adapter. Manual review works without WebGPU.",
            ],
            [
              "Can I trust an AI finding?",
              "ScopeGuard checks that quoted text is present in your contract. Review whether the passage supports the conclusion before sharing it.",
            ],
            [
              "Which files are supported?",
              "Import TXT or PDFs with a text layer, or paste your contract.",
            ],
          ] as const
        ).map(([question, answer]) => (
          <details key={question}>
            <summary>{t(question)}</summary>
            <p>{t(answer)}</p>
          </details>
        ))}
      </section>
      <section className="sg-feature-section sg-privacy">
        <LockKeyhole size={21} />
        <h2>{t("Privacy")}</h2>
        <p>
          {t(
            "Model weights are downloaded on first use. Your contract and client requests are processed on this device.",
          )}
        </p>
        <a className="nav-cta" href="./privacy.html">
          {t("Read the privacy policy")}
        </a>
      </section>
    </main>
  );
}
