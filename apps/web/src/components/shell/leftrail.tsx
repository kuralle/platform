import { cn } from "@kuralle/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  Compass,
  Headset,
  Home,
  LayoutTemplate,
  ListChecks,
  Phone,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";

interface NavLink {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavSection {
  id: string;
  label: string;
  items: NavLink[];
}

function currentReceiptPath() {
  const d = new Date();
  return `/revenue/receipt/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SECTIONS: NavSection[] = [
  {
    id: "configure",
    label: "Configure",
    items: [
      { to: "/agents", label: "Agents", icon: Users },
      { to: "/knowledge", label: "Knowledge base", icon: BookOpen },
      { to: "/templates", label: "Templates", icon: LayoutTemplate },
      { to: "/onboarding", label: "Onboarding", icon: Compass },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    items: [
      { to: "/home", label: "Home", icon: Home },
      { to: "/conversations", label: "Conversations", icon: Headset },
      { to: "/batches", label: "Batches", icon: ListChecks },
    ],
  },
  {
    id: "distribute",
    label: "Distribute",
    items: [
      { to: "/phone-numbers", label: "Numbers", icon: Phone },
      { to: "/telephony", label: "Carriers & connectors", icon: Workflow },
      { to: "/widget", label: "Widget", icon: Activity },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/workspace/settings", label: "Settings", icon: Settings },
      { to: "/workspace/compliance", label: "Compliance", icon: ShieldCheck },
      { to: currentReceiptPath(), label: "ROI receipt", icon: CircleDollarSign },
    ],
  },
];

const STORAGE_KEY = "kuralle.leftrail.collapsed.v1";

export function LeftRail() {
  const router = useRouterState();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v) setCollapsed(v === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const path = router.location.pathname;

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col gap-1 border-r bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-56",
      )}
      aria-label="Primary navigation"
    >
      <div className={cn("flex flex-col gap-5 overflow-y-auto px-2 py-4", collapsed && "items-center")}>
        {SECTIONS.map((section) => (
          <div key={section.id} className="flex flex-col gap-0.5">
            {!collapsed && (
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const isActive =
                item.to === "/home"
                  ? path === "/home" || path === "/"
                  : path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group relative flex h-9 items-center gap-2.5 rounded-md text-[13px] font-medium transition",
                    collapsed ? "size-9 justify-center px-0" : "px-2",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 h-5 w-[3px] rounded-r bg-primary"
                    />
                  )}
                  <item.icon size={16} className={cn(isActive ? "text-primary" : "")} />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "mt-auto flex h-10 items-center gap-2 border-t px-3 text-[12px] text-muted-foreground transition hover:bg-muted hover:text-foreground",
          collapsed && "justify-center px-0",
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
