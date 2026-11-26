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
import { Button } from "./button";
import { translate, type Language } from "./i18n";
const routes = ["dashboard", "projects", "settings", "pricing"];
function current() {
  return location.hash.slice(1).toLowerCase();
}
function Brand({ language }: { language: Language }) {
  const t = translate(language);
  return (
    <a className="brand" href="#home" aria-label={t("ScopeGuard AI home")}>
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
          {t("One workspace.")}
          <br />
          {t("Zero subscription.")}
        </h1>
        <p>
          {t("Review contracts privately with the free early access edition.")}
        </p>
      </div>
      <section className="price-card">
        <LockKeyhole />
        <h2>{t("Local workspace")}</h2>
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
          {t("Get early access")}
        </a>
      </section>
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
    document.title = t("ScopeGuard AI · Contract review");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        t(
          "Review client requests against your contracts and estimate unbilled work privately in your browser.",
        ),
      );
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
      window.scrollTo(0, 0);
    };
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
  const work = routes.slice(0, 3).includes(page);
  const labels = {
    home: t("Overview"),
    dashboard: t("Dashboard"),
    projects: t("Projects"),
    settings: t("Settings"),
    pricing: t("Pricing"),
  };
  const links: (keyof typeof labels)[] = work
    ? ["dashboard", "projects", "settings", "pricing"]
    : ["home", "dashboard", "pricing"];
  return (
    <>
      <header className="site-head">
        <div className="head-inner">
          <Brand language={language} />
          <nav
            aria-label={t("Primary")}
            className={menu ? "nav-links expanded" : "nav-links"}
          >
            {links.map((r) => (
              <a
                key={r}
                href={"#" + r}
                aria-current={
                  page === r || (!page && r === "home") ? "page" : undefined
                }
                onClick={() => setMenu(false)}
              >
                {labels[r]}
              </a>
            ))}
          </nav>
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
              <a className="nav-cta" href="#dashboard">
                {t("Get early access")}
              </a>
            )}
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
          </div>
        </div>
      </header>
      {work ? (
        <Workspace page={page} language={language} />
      ) : page === "pricing" ? (
        <Pricing language={language} />
      ) : (
        <Landing language={language} />
      )}
      <footer className="site-footer">
        <Brand language={language} />
        <span>{t("Private, on-device contract review")}</span>
        <a href="#pricing">{t("Pricing")}</a>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
