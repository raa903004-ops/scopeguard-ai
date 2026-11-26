import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ShieldCheck,
  Sun,
  Moon,
  Menu,
  X,
  Check,
  LockKeyhole,
} from "lucide-react";
import "@fontsource-variable/geist/index.css";
import "./style.css";
import Landing from "./Landing";
import Workspace from "./Workspace";
import { isWorkspaceView } from "./workspace-nav";
import { Button } from "./button";
import { translate, type Language } from "./i18n";
const privacyPage = location.pathname.endsWith("/privacy.html");
const feedbackPage = location.pathname.endsWith("/feedback.html");
const publicPage = privacyPage || feedbackPage;
const homeLink = publicPage ? "./" : "";
const issues = "https://github.com/raa903004-ops/scopeguard-ai/issues";

function current() {
  return location.hash.slice(1).toLowerCase();
}
function Brand({ language }: { language: Language }) {
  const t = translate(language);
  return (
    <a
      className="brand"
      href={homeLink + "#home"}
      aria-label={t("ScopeGuard AI home")}
    >
      <span className="brand-icon">
        <ShieldCheck size={23} />
      </span>
      ScopeGuard <small>AI</small>
    </a>
  );
}
function Pricing({ language }: { language: Language }) {
  const t = translate(language);
  return (
    <main className="pricing">
      <div className="price-heading">
        <span className="eyeline">{t("PRICING")}</span>
        <h1>
          {t("Try ScopeGuard free")}
          <br />
          {t("Optional Pro is planned")}
        </h1>
        <p>{t("Use the free beta now. Pro is optional and planned.")}</p>
      </div>
      <div className="pricing-options">
        <section className="price-card">
          <LockKeyhole />
          <h2>{t("Free beta")}</h2>
          <div className="price">
            $0 <small>{t("/ month")}</small>
          </div>
          <ul>
            {[
              t("Unlimited local projects"),
              t("On-device AI and manual review"),
              t("Exact contract evidence"),
              t("Client email drafts and JSON export"),
            ].map((f) => (
              <li key={f}>
                <Check size={16} />
                {f}
              </li>
            ))}
          </ul>
          <a href="#dashboard" className="nav-cta">
            {t("Try free")}
          </a>
        </section>
        <section className="price-card">
          <h2>
            Pro <small>{t("Planned")}</small>
          </h2>
          <p>{t("Price to be announced")}</p>
          <p>
            {t(
              "Pro is not available for purchase. Share what you need from it on GitHub.",
            )}
          </p>
          <a className="sg-button sg-outline" href="./feedback.html">
            {t("Register interest in Pro")}
          </a>
        </section>
      </div>
    </main>
  );
}
function Privacy({ language }: { language: Language }) {
  const t = translate(language);
  return (
    <main className="sg-feature-section policy">
      <h1>{t("Privacy policy")}</h1>
      {(
        [
          [
            "Where your data lives",
            "Your contracts, requests and saved reviews stay in this browser’s IndexedDB. Theme and language choices are stored in localStorage.",
          ],
          [
            "Network requests",
            "GitHub Pages serves the app. For local AI, your browser downloads public model files from Hugging Face and runtime assets from GitHub. Contract and request text are processed on your device.",
          ],
          [
            "Export and delete",
            "Export or delete your workspace in Settings. To clear cached model files and preferences as well, clear site data in your browser.",
          ],
          [
            "Public support channels",
            "When you open a GitHub feedback link, GitHub handles your submission under its privacy policy. The app does not attach workspace data.",
          ],
        ] as const
      ).map(([title, copy]) => (
        <section key={title}>
          <h2>{t(title)}</h2>
          <p>{t(copy)}</p>
        </section>
      ))}
      <p>
        {t(
          "Chat history, contract versions, extra-work records and drafts are also stored in this browser. Download a backup before clearing site data or switching devices.",
        )}
      </p>
      <p>
        {t(
          "The app sends no usage telemetry and requires no account. Hosting and model providers receive ordinary connection information when serving public files. GitHub feedback is public and may require an account.",
        )}
      </p>
      <a className="sg-button sg-outline" href="./feedback.html">
        {t("Feedback")}
      </a>
    </main>
  );
}

function Feedback({ language }: { language: Language }) {
  const t = translate(language);
  return (
    <main className="sg-feature-section policy">
      <h1>{t("Share feedback or report a bug")}</h1>
      <p>
        {t(
          "Send reproducible steps and your browser version so the issue can be investigated.",
        )}
      </p>
      <p>
        {t(
          "Feedback and bug reports are public on GitHub. Leave out client names, contracts and other private information.",
        )}
      </p>
      <div className="public-actions">
        <a className="nav-cta" href={issues + "/new?title=Bug%20report"}>
          {t("Report a bug")}
        </a>
        <a
          className="sg-button sg-outline"
          href={issues + "/new?title=Feature%20suggestion"}
        >
          {t("Suggest an improvement")}
        </a>
        <a
          className="sg-button sg-outline"
          href={issues + "/new?title=ScopeGuard%20Pro%20interest"}
        >
          {t("Register interest in Pro")}
        </a>
      </div>
    </main>
  );
}
function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem("sg-language") === "ru" ? "ru" : "en";
    } catch {
      return "en";
    }
  });
  const t = translate(language);
  useEffect(() => {
    document.documentElement.lang = language;
    const title = t(
      privacyPage
        ? "ScopeGuard AI | Privacy policy"
        : feedbackPage
          ? "ScopeGuard AI | Feedback"
          : "ScopeGuard AI | Find and price out-of-scope client work",
    );
    const description = t(
      privacyPage
        ? "How ScopeGuard AI stores contracts locally, downloads AI models and lets you export or delete your workspace."
        : feedbackPage
          ? "Report bugs, suggest improvements or register interest in ScopeGuard Pro."
          : "Compare client requests with contracts, cite the exact clause, and estimate extra work. Free, browser-local AI and manual review.",
    );
    document.title = title;
    for (const [selector, value] of [
      [
        'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
        description,
      ],
      ['meta[property="og:title"], meta[name="twitter:title"]', title],
    ])
      document
        .querySelectorAll(selector)
        .forEach((meta) => meta.setAttribute("content", value));
    try {
      localStorage.setItem("sg-language", language);
    } catch {
      // The selection still applies for this session.
    }
  }, [language, t]);
  const [page, setPage] = useState(current),
    [menu, setMenu] = useState(false),
    [dark, setDark] = useState(() => {
      try {
        return localStorage.getItem("sg-theme") === "dark";
      } catch {
        return false;
      }
    });
  useEffect(() => {
    const go = () => {
      setPage(current());
      setMenu(false);
      if (current() === "hardware-requirements")
        requestAnimationFrame(() =>
          document.getElementById("hardware-requirements")?.scrollIntoView(),
        );
      else window.scrollTo(0, 0);
    };
    if (current() === "hardware-requirements") go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("sg-theme", dark ? "dark" : "light");
    } catch {
      /* Theme still applies for this session. */
    }
  }, [dark]);
  const workspacePage =
    page === "demo" ? "analysis" : isWorkspaceView(page) ? page : undefined;
  const work = !publicPage && workspacePage !== undefined;
  const labels = {
    home: t("Overview"),
    dashboard: t("Dashboard"),
    pricing: t("Pricing"),
  };
  const links = ["home", "dashboard", "pricing"] as const;
  return (
    <>
      <header className="site-head" data-workspace={work}>
        <div className="head-inner">
          <Brand language={language} />
          {!work && (
            <nav
              aria-label={t("Primary")}
              className={menu ? "nav-links expanded" : "nav-links"}
            >
              {links.map((r) => (
                <a
                  key={r}
                  href={homeLink + "#" + r}
                  aria-current={
                    !publicPage &&
                    (page === r ||
                      (page === "demo" && r === "dashboard") ||
                      (!page && r === "home"))
                      ? "page"
                      : undefined
                  }
                  onClick={() => setMenu(false)}
                >
                  {labels[r]}
                </a>
              ))}
            </nav>
          )}
          <div className="head-actions">
            <select
              className="language-switch"
              aria-label={t("Language")}
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value === "ru" ? "ru" : "en")
              }
            >
              <option value="en" lang="en">
                EN
              </option>
              <option value="ru" lang="ru">
                RU
              </option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? t("Use light theme") : t("Use dark theme")}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            {!work && (
              <a className="nav-cta" href={homeLink + "#dashboard"}>
                {t("Try free")}
              </a>
            )}
            {!work && (
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-expanded={menu}
                aria-label={t("Toggle navigation")}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X /> : <Menu />}
              </Button>
            )}
          </div>
        </div>
      </header>
      {feedbackPage ? (
        <Feedback language={language} />
      ) : privacyPage ? (
        <Privacy language={language} />
      ) : workspacePage ? (
        <Workspace
          page={workspacePage}
          language={language}
          sampleMode={page === "demo"}
        />
      ) : page === "pricing" ? (
        <Pricing language={language} />
      ) : (
        <Landing language={language} />
      )}
      <footer className="site-footer">
        <Brand language={language} />
        <span>{t("Private, on-device contract review")}</span>
        <nav className="footer-links" aria-label={t("Contact the project")}>
          <a href={homeLink + "#pricing"}>{t("Pricing")}</a>
          <a href="./privacy.html">{t("Privacy policy")}</a>
          <a href="./feedback.html">{t("Feedback")}</a>
          <a href={issues + "/new?title=Product%20feedback"}>
            {t("Send feedback")}
          </a>
          <a href={issues + "/new?title=Bug%20report"}>{t("Report a bug")}</a>
        </nav>
        <small>
          {t(
            "Feedback and bug reports are public on GitHub. Leave out client names, contracts and other private information.",
          )}
        </small>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
