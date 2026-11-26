import { useState } from "react";
import {
  Archive,
  ChevronDown,
  Folder,
  LayoutDashboard,
  MessageSquare,
  ScanLine,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import type { Message, Translate } from "./i18n";

export const workspaceViews = {
  dashboard: {
    label: "Overview",
    description: "Monitor your projects and recent review activity.",
    icon: LayoutDashboard,
  },
  projects: {
    label: "Projects",
    description: "Manage the agreements behind your reviews.",
    icon: Folder,
  },
  analysis: {
    label: "Analysis",
    description:
      "Review client requests and verify findings against the contract.",
    icon: ScanLine,
  },
  chat: {
    label: "AI Chat",
    description: "Ask the local model questions about your project agreement.",
    icon: MessageSquare,
  },
  analytics: {
    label: "Analytics",
    description: "Track potential revenue from saved out-of-scope reviews.",
    icon: TrendingUp,
  },
  reports: {
    label: "Reports",
    description: "Export saved project findings as CSV or PDF.",
    icon: Archive,
  },
  settings: {
    label: "Settings",
    description: "Control your rates and local data.",
    icon: SlidersHorizontal,
  },
} as const satisfies Record<
  string,
  { label: Message; description: Message; icon: typeof Folder }
>;

export type WorkspaceView = keyof typeof workspaceViews;
export const isWorkspaceView = (value: string): value is WorkspaceView =>
  Object.hasOwn(workspaceViews, value);

export function WorkspaceNavigation({
  page,
  t,
}: {
  page: WorkspaceView;
  t: Translate;
}) {
  const [expanded, setExpanded] = useState(false);
  const CurrentIcon = workspaceViews[page].icon;
  return (
    <aside className="ws-sidebar">
      <button
        type="button"
        className="ws-nav-toggle"
        aria-expanded={expanded}
        aria-controls="workspace-nav"
        onClick={() => setExpanded(!expanded)}
      >
        <CurrentIcon size={17} /> {t(workspaceViews[page].label)}{" "}
        <ChevronDown size={16} />
      </button>
      <nav
        id="workspace-nav"
        className="ws-nav"
        data-expanded={expanded}
        aria-label={t("Workspace navigation")}
      >
        {Object.keys(workspaceViews)
          .filter(isWorkspaceView)
          .map((id) => {
            const { icon: Icon, label } = workspaceViews[id];
            return (
              <a
                key={id}
                href={"#" + id}
                aria-current={page === id ? "page" : undefined}
                onClick={() => setExpanded(false)}
              >
                <Icon size={17} /> {t(label)}
              </a>
            );
          })}
      </nav>
    </aside>
  );
}
