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
const routes = ["dashboard", "projects", "settings", "pricing"];
function current() {
  return location.hash.slice(1).toLowerCase();
}
function Brand() {
  return (
    <a className="brand" href="#home" aria-label="ScopeGuard AI home">
      <span className="brand-icon">
        <ShieldCheck size={23} />
      </span>
      ScopeGuard <small>AI</small>
    </a>
  );
}
function Pricing() {
  return (
    <main className="pricing">
      <div className="price-heading">
        <span className="eyeline">PRICING</span>
        <h1>
          One workspace.
          <br />
          Zero subscription.
        </h1>
        <p>Review contracts privately with the free early access edition.</p>
      </div>
      <section className="price-card">
        <LockKeyhole />
        <h2>Local workspace</h2>
        <div className="price">
          $0 <small>/ month</small>
        </div>
        <ul>
          {[
            "Unlimited local projects",
            "On-device AI and manual review",
            "Exact contract evidence",
            "Client email drafts and JSON export",
          ].map((f) => (
            <li key={f}>
              <Check size={16} />
              {f}
            </li>
          ))}
        </ul>
        <a href="#dashboard" className="nav-cta">
          Get early access
        </a>
      </section>
    </main>
  );
}
function App() {
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
  const links = work
    ? ["dashboard", "projects", "settings", "pricing"]
    : ["home", "dashboard", "pricing"];
  return (
    <>
      <header className="site-head">
        <div className="head-inner">
          <Brand />
          <nav
            aria-label="Primary"
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
                {r === "home" ? "Overview" : r[0].toUpperCase() + r.slice(1)}
              </a>
            ))}
          </nav>
          <div className="head-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            {!work && (
              <a className="nav-cta" href="#dashboard">
                Get early access
              </a>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-expanded={menu}
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>
      {work ? (
        <Workspace page={page} />
      ) : page === "pricing" ? (
        <Pricing />
      ) : (
        <Landing />
      )}
      <footer className="site-footer">
        <Brand />
        <span>Private, on-device contract review</span>
        <a href="#pricing">Pricing</a>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
