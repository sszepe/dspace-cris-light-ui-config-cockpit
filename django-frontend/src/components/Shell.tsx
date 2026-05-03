import React from "react";
import { useAuth } from "../auth/AuthContext";

// ── Page keys ─────────────────────────────────────────────────────────────────

export type PageKey =
  | "dashboard"
  | "settings"
  | "clusters"
  | "mappings"
  | "quicklinks"
  | "sub-forms"
  | "sub-processes"
  | "form-layouts"
  | "form-builder"      // visual drag-and-drop form builder
  | "vocab-editor"      // controlled vocabulary XML editor
  | "value-pairs"       // submission form value-pair sets editor
  | "cris-layout"
  | "metadata"
  | "audit";

interface NavEntry {
  key: PageKey;
  label: string;
  icon: string;
  section: string;
}

const NAV: NavEntry[] = [
  { key: "dashboard",      label: "Overview",             icon: "🏠", section: "General" },
  { key: "settings",       label: "Site Settings",        icon: "⚙️",  section: "General" },
  { key: "clusters",       label: "Entity Clusters",      icon: "🗂️",  section: "Dashboard" },
  { key: "mappings",       label: "Collection Mappings",  icon: "🔗",  section: "Submission" },
  { key: "quicklinks",     label: "Quicklink Presets",    icon: "⚡",  section: "Navigation" },
  { key: "sub-forms",      label: "Submission Forms",     icon: "📋",  section: "Submission" },
  { key: "sub-processes",  label: "Submission Processes", icon: "🔄",  section: "Submission" },
  { key: "form-layouts",   label: "Form Layouts",         icon: "✏️",  section: "Submission" },
  { key: "form-builder",   label: "Form Builder",         icon: "🧩",  section: "Submission" },
  { key: "vocab-editor",   label: "Vocabulary Editor",    icon: "📚",  section: "Submission" },
  { key: "value-pairs",    label: "Value Pairs",          icon: "🔢",  section: "Submission" },
  { key: "cris-layout",    label: "CRIS Layout",          icon: "🖼️",  section: "Layout" },
  { key: "metadata",       label: "Metadata Registry",    icon: "🔍",  section: "Data" },
  { key: "audit",          label: "Audit",                icon: "📊",  section: "Data" },
];

const SECTIONS = [...new Set(NAV.map((n) => n.section))];

function initials(user: { first_name: string; last_name: string; username: string }) {
  const f = user.first_name?.[0] ?? "";
  const l = user.last_name?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return user.username.slice(0, 2).toUpperCase();
}

// ── Header ────────────────────────────────────────────────────────────────────

function AppHeader() {
  const { user, logout } = useAuth();
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-logo">DC</div>
        <div className="header-title-block">
          <div className="header-title">DSpace CRIS Config Cockpit</div>
          <div className="header-sub">Configuration management</div>
        </div>
      </div>
      {user && (
        <div className="header-user">
          <div className="header-avatar">{initials(user)}</div>
          <span className="header-username">{user.username}</span>
          {user.is_superuser && (
            <span className="chip chip-amber" style={{ marginRight: 4 }}>
              superuser
            </span>
          )}
          <button className="header-logout" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  active,
  onNavigate,
}: {
  active: PageKey;
  onNavigate: (p: PageKey) => void;
}) {
  const { user } = useAuth();
  return (
    <aside className="sidebar">
      {SECTIONS.map((section) => (
        <div key={section}>
          <div className="sidebar-section-label">{section}</div>
          {NAV.filter((n) => n.section === section).map((n) => (
            <button
              key={n.key}
              className={`nav-item${active === n.key ? " active" : ""}`}
              onClick={() => onNavigate(n.key)}
            >
              <span className="nav-item-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      ))}
      <div className="sidebar-footer">
        v1.0 · Django REST
        {user && (
          <div style={{ marginTop: 4, fontSize: 10 }}>
            {user.is_staff ? "Staff" : "User"}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function AppFooter() {
  return (
    <footer className="app-footer">
      <span>DSpace CRIS Config Cockpit</span>
      <span>
        Config API: <code style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>/api/dspace-config/</code>
      </span>
    </footer>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function Shell({
  activePage,
  onNavigate,
  children,
}: {
  activePage: PageKey;
  onNavigate: (p: PageKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-body">
        <Sidebar active={activePage} onNavigate={onNavigate} />
        <main className="content-area">{children}</main>
      </div>
      <AppFooter />
    </div>
  );
}
