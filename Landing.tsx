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
import { Button } from "./button";
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
            {t("Find the work")}
            <br /> <em>{t("between")}</em> {t("the lines.")}
          </h1>
          <p>
            {t(
              "Catch out-of-scope requests before they become unpaid hours. Compare client requests against your contract, privately on your device.",
            )}
          </p>
          <div className="sg-actions">
            <Button
              onClick={() => {
                location.hash = "dashboard";
              }}
            >
              {t("Open workspace")}
            </Button>
            <button
              className="sg-demo-button"
              onClick={() => {
                demo.current?.scrollIntoView({ behavior: "smooth" });
                demo.current?.focus({ preventScroll: true });
              }}
            >
              <Play size={15} /> {t("Explore demo")}
            </button>
          </div>
          <div className="sg-private">
            <LockKeyhole size={14} /> {t("Private by design")}
            <i /> {t("No account required")}
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
    </main>
  );
}
