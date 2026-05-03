/**
 * FormBuilderPage.tsx
 *
 * Integrates the improved Form Builder into the django-frontend Config Cockpit.
 *
 * Replaces the form-builder.tsx that was previously living in the dspace-cris
 * Vite/React frontend. All API calls go through `apiFetch` (the same client
 * used by CrisLayoutPage and MetadataPage) so no additional HTTP client is
 * needed.
 *
 * API surface used:
 *   GET  /api/dspace-config/submission-forms/
 *   GET  /api/dspace-config/submission-forms/:id/
 *   GET  /api/dspace-config/submission-processes/
 *   GET  /api/dspace-config/submission-processes/:id/
 *   GET  /api/dspace-config/metadata-fields/?q=…&page=…&page_size=…
 *   POST /api/dspace-config/form-layouts/
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../api/client";
import { PageHeader } from "../components/shared";

// ─────────────────────────────────────────────────────────────────────────────
// API base path
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "/api/dspace-config";

async function cfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const opts: RequestInit = { credentials: "include", ...init };
  if (init?.body && !opts.headers) {
    opts.headers = { "Content-Type": "application/json" };
  }
  return apiFetch<T>(`${BASE}${path}`, opts as any);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type BaseField = {
  id: number; row: number; col: number;
  field: string; label: string; input_type: string;
  is_required: boolean; required_msg?: string; repeatable?: boolean;
  vocabulary: string; vocabulary_closed?: boolean;
  value_pairs_name: string; hint: string;
  style?: string; regex?: string; language_codes?: string[];
  type_binds?: string[]; readonly?: boolean;
  child_form_name?: string; child_form?: number | null;
  child_form_name_resolved?: string | null;
};

type MetaField = {
  id: number; field: string; element: string; qualifier: string;
  schema_name: string; scope_note: string;
};

type CanvasRow  = { id: string; cols: CanvasCell[] };
type CanvasCell = {
  field_name: string; label_override: string; hint_override: string; hidden: boolean;
  required_override?: boolean | null; repeatable_override?: boolean | null;
  vocabulary_override?: string; vocabulary_closed_override?: boolean | null;
  value_pairs_override?: string; style_override?: string;
  type_bind_override?: string; child_form_override?: string;
  readonly_override?: boolean | null;
};

type FormListItem    = { id: number; name: string; field_count: number; contains_required: boolean; imported_at: string };
type ProcessListItem = { id: number; name: string; step_count: number; imported_at: string };
type ProcessStep     = { id: number; sort_order: number; step_id: string; type: string | null; mandatory: boolean; heading: string; processing_class: string };
type ProcessDetail   = { id: number; name: string; step_count: number; steps: ProcessStep[]; imported_at: string };

// ─────────────────────────────────────────────────────────────────────────────
// Value pairs definitions (from submission-forms.xml analysis)
// ─────────────────────────────────────────────────────────────────────────────

const VALUE_PAIRS: Record<string, Array<{ displayed_value: string; stored_value: string }>> = {
  common_iso_languages: [
    { displayed_value: "N/A", stored_value: "" },
    { displayed_value: "English", stored_value: "en" },
    { displayed_value: "English (US)", stored_value: "en_US" },
    { displayed_value: "German", stored_value: "de" },
    { displayed_value: "French", stored_value: "fr" },
    { displayed_value: "Spanish", stored_value: "es" },
    { displayed_value: "Italian", stored_value: "it" },
    { displayed_value: "Japanese", stored_value: "ja" },
    { displayed_value: "Chinese", stored_value: "zh" },
    { displayed_value: "(Other)", stored_value: "other" },
  ],
  gender: [
    { displayed_value: "Male", stored_value: "m" },
    { displayed_value: "Woman", stored_value: "f" },
    { displayed_value: "Unspecified", stored_value: "n/a" },
  ],
  truefalse: [
    { displayed_value: "True", stored_value: "true" },
    { displayed_value: "False", stored_value: "false" },
  ],
  orgunit_types: [
    { displayed_value: "Unspecified", stored_value: "" },
    { displayed_value: "University", stored_value: "University" },
    { displayed_value: "Research Institute", stored_value: "Research Institute" },
    { displayed_value: "Company", stored_value: "Company" },
    { displayed_value: "Government", stored_value: "Government" },
    { displayed_value: "Higher Education", stored_value: "Higher Education" },
    { displayed_value: "Other", stored_value: "Other" },
  ],
  orgunit_identifiers: [
    { displayed_value: "CrossRef Funder ID", stored_value: "crossrefid" },
    { displayed_value: "Research Organization Registry (ROR)", stored_value: "ror" },
    { displayed_value: "ISNI", stored_value: "isni" },
    { displayed_value: "Ringgold", stored_value: "rin" },
    { displayed_value: "LEI", stored_value: "lei" },
    { displayed_value: "Generic ID", stored_value: "" },
  ],
  common_identifiers: [
    { displayed_value: "DOI", stored_value: "doi" },
    { displayed_value: "Scopus ID", stored_value: "scopus" },
    { displayed_value: "WOS ID", stored_value: "isi" },
    { displayed_value: "Pubmed ID", stored_value: "pmid" },
    { displayed_value: "arXiv ID", stored_value: "arxiv" },
    { displayed_value: "ISBN", stored_value: "isbn" },
    { displayed_value: "URI", stored_value: "uri" },
    { displayed_value: "Other", stored_value: "other" },
  ],
  project_types: [
    { displayed_value: "Unspecified", stored_value: "" },
    { displayed_value: "basic research", stored_value: "basic research" },
    { displayed_value: "applied research", stored_value: "applied research" },
    { displayed_value: "experimental development", stored_value: "experimental development" },
  ],
  funding_types: [
    { displayed_value: "Unspecified", stored_value: "" },
    { displayed_value: "Gift", stored_value: "Gift" },
    { displayed_value: "Internal Funding", stored_value: "Internal Funding" },
    { displayed_value: "Contract", stored_value: "Contract" },
    { displayed_value: "Award", stored_value: "Award" },
    { displayed_value: "Grant", stored_value: "Grant" },
  ],
  event_types: [
    { displayed_value: "Unspecified", stored_value: "" },
    { displayed_value: "Conference", stored_value: "Conference" },
    { displayed_value: "Workshop", stored_value: "Workshop" },
  ],
  bitstream_types: [
    { displayed_value: "Unspecified", stored_value: "" },
    { displayed_value: "Logo", stored_value: "logo" },
    { displayed_value: "Main Article", stored_value: "main article" },
    { displayed_value: "Personal Picture", stored_value: "personal picture" },
  ],
  currency: [
    { displayed_value: "Euro", stored_value: "Euro" },
    { displayed_value: "Pound sterling", stored_value: "Pound sterling" },
    { displayed_value: "Swiss franc", stored_value: "Swiss franc" },
  ],
  common_iso_countries: [
    { displayed_value: "Unspecified", stored_value: "" },
    { displayed_value: "Austria", stored_value: "AT" },
    { displayed_value: "Germany", stored_value: "DE" },
    { displayed_value: "Switzerland", stored_value: "CH" },
    { displayed_value: "United Kingdom", stored_value: "GB" },
    { displayed_value: "United States", stored_value: "US" },
  ],
};

const ALL_STYLE_OPTIONS = [
  "", "col-xs-12", "col-xs-12 col-md-6", "col-xs-12 col-md-9",
  "col-xs-12 col-md-3", "col-12", "col-xs-12 col-md-6 col-lg-3",
];

const INPUT_ICONS: Record<string, string> = {
  onebox: "T", textarea: "¶", dropdown: "▾", date: "📅",
  name: "👤", tag: "#", group: "⊞", "inline-group": "⊟",
  qualdrop_value: ":", series: "≡", link: "🔗", lookup: "🔍", list: "≣",
};
const inputIcon = (t: string) => INPUT_ICONS[t] ?? "?";

function uid() { return Math.random().toString(36).slice(2, 9); }

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inputTypeBg(t: string): string {
  const m: Record<string, string> = {
    onebox: "#dbeafe", textarea: "#fce7f3", dropdown: "#d1fae5", date: "#fef3c7",
    name: "#ede9fe", tag: "#f0f9ff", group: "#f5f3ff", "inline-group": "#faf5ff",
    qualdrop_value: "#ecfdf5", series: "#fff7ed", link: "#f0fdf4",
  };
  return m[t] ?? "#f1f5f9";
}
function inputTypeColor(t: string): string {
  const m: Record<string, string> = {
    onebox: "#1d4ed8", textarea: "#9d174d", dropdown: "#065f46", date: "#92400e",
    name: "#6d28d9", tag: "#0369a1", group: "#7c3aed", "inline-group": "#6d28d9",
    qualdrop_value: "#047857", series: "#c2410c", link: "#15803d",
  };
  return m[t] ?? "#374151";
}

function buildCanvas(fields: BaseField[]): CanvasRow[] {
  const byRow = new Map<number, BaseField[]>();
  for (const f of fields) { if (!byRow.has(f.row)) byRow.set(f.row, []); byRow.get(f.row)!.push(f); }
  return Array.from(byRow.entries()).sort(([a], [b]) => a - b).map(([, rf]) => ({
    id: uid(),
    cols: [...rf].sort((a, b) => a.col - b.col).map(f => ({
      field_name: f.field, label_override: "", hint_override: "", hidden: false,
    })),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared tiny atoms — use the app's CSS classes where possible
// ─────────────────────────────────────────────────────────────────────────────

const iSt: React.CSSProperties = {
  width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)",
  fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 5,
  fontFamily: "inherit", background: "var(--surface)", color: "var(--text)",
};

function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2, marginTop: 6 }}>{children}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
    <span style={{ color: "var(--muted)", flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 11, fontFamily: "monospace", maxWidth: "60%", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldChip
// ─────────────────────────────────────────────────────────────────────────────

function FieldChip({ base, override, selected, placed, onDragStart, onClick, compact }: {
  base: BaseField; override?: CanvasCell; selected?: boolean; placed?: boolean;
  onDragStart?: (e: React.DragEvent) => void; onClick?: () => void; compact?: boolean;
}) {
  const label   = override?.label_override || base.label || base.field;
  const hidden  = override?.hidden ?? false;
  const isGroup = base.input_type === "group" || base.input_type === "inline-group";
  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart} onClick={onClick}
      title={`${base.field}\nType: ${base.input_type}${base.hint ? "\n" + base.hint : ""}`}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: compact ? "3px 7px" : "5px 9px", borderRadius: 5,
        background: selected ? "#ede9fe" : "var(--surface)",
        border: `1.5px solid ${selected ? "#7c3aed" : isGroup ? "#c4b5fd" : "var(--border)"}`,
        cursor: onDragStart ? "grab" : onClick ? "pointer" : "default",
        opacity: hidden ? 0.5 : (placed && !onDragStart) ? 0.45 : 1,
        fontSize: 11, fontFamily: "monospace", userSelect: "none",
        minWidth: 0, overflow: "hidden", transition: "all 0.1s",
      }}>
      <span style={{ width: 15, height: 15, borderRadius: 3,
        background: inputTypeBg(base.input_type), color: inputTypeColor(base.input_type),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
        {inputIcon(base.input_type)}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ color: "var(--muted)", fontSize: 9, flexShrink: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {base.field.split(".").slice(-1)[0]}
      </span>
      {placed && !onDragStart && <span style={{ color: "#86efac", fontSize: 9 }}>✓</span>}
      {base.is_required && <span style={{ color: "#b45309", fontWeight: 800, fontSize: 9 }}>*</span>}
      {hidden && <span style={{ color: "#cbd5e1", fontSize: 9 }}>⊘</span>}
      {base.repeatable && <span style={{ color: "#fb923c", fontSize: 9 }}>+</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeaheadSidebar
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FieldSearch — reusable typeahead input with portal dropdown.
// Works in any container regardless of overflow/clipping.
// ─────────────────────────────────────────────────────────────────────────────

function FieldSearch({ baseFields, metaFields, placed, onAdd, placeholder = "Search fields…" }: {
  baseFields: BaseField[];
  metaFields: MetaField[];
  placed: Set<string>;
  onAdd: (fieldName: string, src: "palette" | "meta") => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const fm = baseFields
      .filter(f => f.field.toLowerCase().includes(q) || (f.label || "").toLowerCase().includes(q))
      .slice(0, 9)
      .map(f => ({ field: f.field, label: f.label, inputType: f.input_type, src: "palette" as const, placed: placed.has(f.field) }));
    const mm = metaFields
      .filter(f => f.field.toLowerCase().includes(q))
      .slice(0, 5)
      .map(f => ({ field: f.field, label: "", inputType: "onebox", src: "meta" as const, placed: placed.has(f.field) }));
    return [...fm, ...mm].slice(0, 13);
  }, [query, baseFields, metaFields, placed]);

  // Recalculate portal position on open
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 2, left: r.left, width: r.width });
  }, [open, query]);

  function pick(fieldName: string, src: "palette" | "meta") {
    onAdd(fieldName, src);
    setQuery(""); setOpen(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open || !suggestions.length) {
      if (e.key === "Escape") { setQuery(""); setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); const s = suggestions[activeIdx]; pick(s.field, s.src); }
    if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
  }

  const dropdown = open && suggestions.length > 0 && createPortal(
    <div style={{
      position: "fixed", top: dropPos.top, left: dropPos.left, width: Math.max(dropPos.width, 260),
      zIndex: 99999, background: "#fff", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.16)", overflow: "hidden",
    }}>
      {suggestions.map((s, idx) => (
        <div key={s.field + s.src}
          onMouseDown={e => { e.preventDefault(); pick(s.field, s.src); }}
          style={{
            display: "flex", alignItems: "center", gap: 7, padding: "6px 10px",
            background: idx === activeIdx ? "#f5f3ff" : s.placed ? "#f9fafb" : "#fff",
            cursor: "pointer", borderBottom: "1px solid #f3f4f6",
            transition: "background 0.08s",
          }}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          {s.src === "palette" ? (
            <span style={{ width: 16, height: 16, borderRadius: 3, background: inputTypeBg(s.inputType), color: inputTypeColor(s.inputType), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
              {inputIcon(s.inputType)}
            </span>
          ) : (
            <span style={{ width: 16, height: 16, borderRadius: 3, background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>M</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: s.placed ? "var(--muted)" : "#1e293b" }}>
              {s.field}
            </div>
            {s.label && s.label !== s.field && (
              <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
            )}
          </div>
          {s.placed
            ? <span style={{ fontSize: 9, color: "#86efac", flexShrink: 0 }}>✓ placed</span>
            : <span style={{ fontSize: 9, color: "var(--muted)", flexShrink: 0 }}>click to add</span>
          }
        </div>
      ))}
      <div style={{ padding: "5px 10px", fontSize: 10, color: "var(--muted)", background: "#f9fafb", borderTop: "1px solid #f3f4f6", display: "flex", gap: 8 }}>
        <span>↵ add</span><span>↑↓ navigate</span><span>Esc close</span>
      </div>
    </div>,
    document.body
  );

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 12, pointerEvents: "none", zIndex: 1 }}>⌕</span>
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(-1); }}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={{ ...iSt, marginBottom: 0, paddingLeft: 24, paddingRight: query ? 26 : 8, width: "100%", boxSizing: "border-box", fontSize: 11 }}
        autoComplete="off"
      />
      {query && (
        <button
          onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: 0, zIndex: 1, lineHeight: 1 }}
        >✕</button>
      )}
      {dropdown}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeaheadSidebar — left panel of the main FormEditor
// ─────────────────────────────────────────────────────────────────────────────

function TypeaheadSidebar({ baseFields, metaFields, metaLoading, metaTotal, metaPage,
  onLoadMoreMeta, placed, onDragStart, onClickAdd }: {
  baseFields: BaseField[]; metaFields: MetaField[];
  metaLoading: boolean; metaTotal: number; metaPage: number;
  onLoadMoreMeta: () => void; placed: Set<string>;
  onDragStart: (e: React.DragEvent, fn: string, src: "palette" | "meta") => void;
  onClickAdd: (fn: string, src: "palette" | "meta") => void;
}) {
  const [mode, setMode] = useState<"form" | "meta">("form");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const g: Record<string, BaseField[]> = {};
    for (const f of baseFields) { if (!g[f.input_type]) g[f.input_type] = []; g[f.input_type].push(f); }
    return g;
  }, [baseFields]);

  const sortedTypes = useMemo(() => Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length), [grouped]);

  return (
    <div style={{ width: 230, borderRight: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Pill mode tabs */}
      <div style={{ display: "flex", gap: 2, padding: "8px 8px 6px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {(["form", "meta"] as const).map((m, i) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 600,
            borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0",
            border: "1px solid",
            borderColor: mode === m ? "var(--accent)" : "#e2e8f0",
            background: mode === m ? "var(--accent)" : "#fff",
            color: mode === m ? "#fff" : "var(--muted)",
            cursor: "pointer",
          }}>
            {m === "form" ? `Form (${baseFields.length})` : "All fields"}
          </button>
        ))}
      </div>

      {/* Typeahead search — portal-based, always on top */}
      <div style={{ padding: "7px 8px 6px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <FieldSearch
          baseFields={baseFields}
          metaFields={metaFields}
          placed={placed}
          onAdd={(fn, src) => onClickAdd(fn, src)}
          placeholder={mode === "form" ? "Search & add fields…" : "Search all metadata…"}
        />
      </div>

      {/* Body — scrollable list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {mode === "form" ? (
          <>
            {sortedTypes.map(type => {
              const fields = grouped[type];
              const isCollapsed = collapsed[type] ?? false;
              return (
                <div key={type}>
                  <div
                    onClick={() => setCollapsed(p => ({ ...p, [type]: !isCollapsed }))}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", cursor: "pointer", userSelect: "none", background: "#fafafa", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 1 }}>
                    <span style={{ width: 13, height: 13, borderRadius: 3, background: inputTypeBg(type), color: inputTypeColor(type), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, flexShrink: 0 }}>{inputIcon(type)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, flex: 1, textTransform: "capitalize" }}>{type}</span>
                    <span style={{ fontSize: 9, color: "var(--muted)" }}>{fields.length}</span>
                    <span style={{ fontSize: 9, color: "var(--muted)" }}>{isCollapsed ? "▸" : "▾"}</span>
                  </div>
                  {!isCollapsed && (
                    <div style={{ padding: "3px 7px" }}>
                      {fields.map(f => (
                        <div key={f.field}
                          draggable={!placed.has(f.field)}
                          onDragStart={e => onDragStart(e, f.field, "palette")}
                          style={{ marginBottom: 2, cursor: placed.has(f.field) ? "default" : "grab" }}>
                          <FieldChip base={f} placed={placed.has(f.field)} compact
                            onClick={placed.has(f.field) ? undefined : () => onClickAdd(f.field, "palette")} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {sortedTypes.length === 0 && <div style={{ color: "var(--muted)", fontSize: 11, padding: "16px 8px", textAlign: "center" }}>No fields match</div>}
            <div style={{ padding: "6px 8px", borderTop: "1px solid var(--border)", fontSize: 9, color: "var(--muted)" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["#fde68a","Required"],["#e9d5ff","Group"],["#bfdbfe","Authority"],["#d9f99d","Pairs"]].map(([c,l]) => (
                  <span key={l} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: c, display: "inline-block" }} />{l}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 3 }}>Use search above · click or drag · ✓ = placed</div>
            </div>
          </>
        ) : (
          <>
            {metaLoading && metaPage === 0
              ? <div style={{ color: "var(--muted)", fontSize: 11, padding: 10 }}>Loading…</div>
              : metaFields.map(f => (
                <div key={f.id}
                  draggable={!placed.has(f.field)}
                  onDragStart={e => onDragStart(e, f.field, "meta")}
                  onClick={placed.has(f.field) ? undefined : () => onClickAdd(f.field, "meta")}
                  title={`${f.field}${f.scope_note ? "\n" + f.scope_note : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderBottom: "1px solid var(--border)", background: placed.has(f.field) ? "#fafafa" : "#fff", cursor: placed.has(f.field) ? "default" : "pointer", opacity: placed.has(f.field) ? 0.5 : 1, fontSize: 11, fontFamily: "monospace", userSelect: "none" }}>
                  <span style={{ width: 13, height: 13, borderRadius: 2, background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, flexShrink: 0 }}>M</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.field}</span>
                  {placed.has(f.field) && <span style={{ fontSize: 9, color: "#86efac" }}>✓</span>}
                </div>
              ))}
            {!metaLoading && metaFields.length < metaTotal && (
              <button onClick={onLoadMoreMeta} style={{ width: "100%", padding: "5px 0", borderTop: "1px solid var(--border)", background: "#fafafa", fontSize: 11, color: "#7c3aed", cursor: "pointer", border: "none", fontWeight: 600 }}>
                Load more ({metaTotal - metaFields.length} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Centralized drag state — avoids HTML5 event propagation fights
// ─────────────────────────────────────────────────────────────────────────────

type DragPayload =
  | { kind: "palette"; fieldName: string }
  | { kind: "meta";    fieldName: string }
  | { kind: "row";     rowIdx: number }
  | { kind: "cell";    rowIdx: number; colIdx: number };

// Global mutable ref shared across all canvas components in one FormEditor.
// We use a module-level variable rather than React context to avoid re-renders.
let _dragPayload: DragPayload | null = null;

function setDrag(p: DragPayload | null) { _dragPayload = p; }
function getDrag(): DragPayload | null { return _dragPayload; }

// ─────────────────────────────────────────────────────────────────────────────
// CanvasRowCard — full row with columns, drop targets, reorder
// ─────────────────────────────────────────────────────────────────────────────

type DropFn = (payload: DragPayload, targetRow: number, targetCol: number | null) => void;

function CanvasRowCard({ rowIdx, row, fieldMap, sel, onSelect, onDrop, onRemove, canUp, canDown, onMoveRow }: {
  rowIdx: number;
  row: CanvasRow;
  fieldMap: Map<string, BaseField>;
  sel: { row: number; col: number } | null;
  onSelect: (r: number, c: number) => void;
  onDrop: DropFn;
  onRemove: (r: number, c: number) => void;
  canUp: boolean; canDown: boolean;
  onMoveRow: (from: number, to: number) => void;
}) {
  const [rowOver, setRowOver]     = useState(false);
  const [colOver, setColOver]     = useState<number | null>(null);
  const [addOver, setAddOver]     = useState(false);

  function acceptDrop(targetCol: number | null) {
    const p = getDrag();
    if (!p) return;
    onDrop(p, rowIdx, targetCol);
    setDrag(null);
    setColOver(null);
    setRowOver(false);
    setAddOver(false);
  }

  const isDraggingCell = () => { const p = getDrag(); return p?.kind === "cell"; };

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 4, marginBottom: 3 }}>

      {/* Row handle */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, width: 22, flexShrink: 0 }}>
        <div
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "row", rowIdx }); }}
          onDragEnd={() => setDrag(null)}
          style={{ cursor: "grab", color: "var(--muted)", fontSize: 14, userSelect: "none", lineHeight: 1, padding: "2px" }}
          title="Drag to reorder row"
        >⠿</div>
        <button onClick={() => canUp && onMoveRow(rowIdx, rowIdx - 1)} disabled={!canUp}
          style={{ background: "none", border: "none", cursor: canUp ? "pointer" : "default", color: canUp ? "var(--muted)" : "var(--border)", fontSize: 10, padding: "1px", lineHeight: 1 }}>▲</button>
        <button onClick={() => canDown && onMoveRow(rowIdx, rowIdx + 1)} disabled={!canDown}
          style={{ background: "none", border: "none", cursor: canDown ? "pointer" : "default", color: canDown ? "var(--muted)" : "var(--border)", fontSize: 10, padding: "1px", lineHeight: 1 }}>▼</button>
      </div>

      {/* Row body — drop target for row reorder */}
      <div
        onDragOver={e => { e.preventDefault(); const p = getDrag(); if (p?.kind === "row" && (p as any).rowIdx !== rowIdx) setRowOver(true); }}
        onDragLeave={() => setRowOver(false)}
        onDrop={e => { e.preventDefault(); const p = getDrag(); if (p?.kind === "row" && (p as any).rowIdx !== rowIdx) { onMoveRow((p as any).rowIdx, rowIdx); setDrag(null); } setRowOver(false); }}
        style={{
          flex: 1, display: "flex", alignItems: "stretch", minHeight: 48,
          border: `2px solid ${rowOver ? "#7c3aed" : "var(--border)"}`,
          borderRadius: 7, background: "#fff", overflow: "visible",
          transition: "border-color 0.1s",
        }}
      >
        {/* Existing columns */}
        {row.cols.map((cf, ci) => {
          const base = fieldMap.get(cf.field_name);
          const isSelected = sel?.row === rowIdx && sel?.col === ci;
          const isOver = colOver === ci;
          const label = cf.label_override || base?.label || cf.field_name;
          const typeTxt = base ? inputTypeColor(base.input_type) : "#9ca3af";
          const typeBg  = base ? inputTypeBg(base.input_type)    : "#f3f4f6";
          return (
            <React.Fragment key={ci}>
              {/* Vertical separator / column drop zone */}
              {ci > 0 && (
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); const p = getDrag(); if (p) setColOver(ci); }}
                  onDragLeave={() => setColOver(null)}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); acceptDrop(ci); }}
                  style={{
                    width: colOver === ci ? 32 : 4, flexShrink: 0, alignSelf: "stretch",
                    background: colOver === ci ? "#ede9fe" : "var(--border)",
                    border: colOver === ci ? "2px dashed #7c3aed" : "none",
                    borderRadius: 4, transition: "all 0.1s", cursor: "col-resize",
                  }}
                />
              )}

              {/* Field cell */}
              <div
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "cell", rowIdx, colIdx: ci }); }}
                onDragEnd={() => setDrag(null)}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (isDraggingCell()) setColOver(ci); }}
                onDragLeave={() => { if (colOver === ci) setColOver(null); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); acceptDrop(ci); }}
                onClick={() => onSelect(rowIdx, ci)}
                style={{
                  flex: 1, minWidth: 140, padding: "8px 10px", cursor: "pointer",
                  background: isOver ? "#ede9fe" : isSelected ? "#faf5ff" : "#fff",
                  borderLeft: ci > 0 ? "none" : "none",
                  display: "flex", flexDirection: "column", gap: 3,
                  transition: "background 0.1s",
                  borderRadius: ci === 0 ? "5px 0 0 5px" : (ci === row.cols.length - 1 ? "0 5px 5px 0" : "0"),
                }}
              >
                {base ? (
                  <>
                    {/* Type badge + label */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: typeBg, color: typeTxt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                        {inputIcon(base.input_type)}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: isSelected ? 600 : 500, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {label}
                      </span>
                      {base.is_required && <span style={{ color: "#b45309", fontSize: 10, flexShrink: 0 }}>*</span>}
                    </div>
                    {/* Field name + flags */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <code style={{ fontSize: 10, color: "var(--muted)", background: "var(--bg)", padding: "1px 4px", borderRadius: 3 }}>
                        {cf.field_name.split(".").slice(-2).join(".")}
                      </code>
                      {cf.hidden && <span style={{ fontSize: 9, color: "#64748b" }}>hidden</span>}
                      {cf.label_override && <span style={{ fontSize: 9, color: "#7c3aed" }}>label↑</span>}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: "#fca5a5", fontFamily: "monospace" }}>⚠ {cf.field_name}</span>
                )}
                {isSelected && (
                  <div style={{ height: 2, background: "#7c3aed", borderRadius: 1, marginTop: 2 }} />
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* + Add column drop zone (always shown when row has < 2 cols) */}
        {row.cols.length < 2 && (
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setAddOver(true); }}
            onDragLeave={() => setAddOver(false)}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); acceptDrop(row.cols.length); setAddOver(false); }}
            style={{
              width: addOver ? 120 : 44, flexShrink: 0, alignSelf: "stretch",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: addOver ? "#ede9fe" : "transparent",
              border: addOver ? "2px dashed #7c3aed" : "2px dashed var(--border)",
              borderRadius: "0 5px 5px 0", borderLeft: "none",
              color: addOver ? "#7c3aed" : "var(--muted)",
              fontSize: 11, fontWeight: 600, cursor: "copy",
              transition: "all 0.15s",
            }}
            title="Drag a field here to add a second column"
          >
            {addOver ? "Drop here" : "+ col"}
          </div>
        )}
      </div>

      {/* Remove buttons — one per column */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", width: 18, flexShrink: 0 }}>
        {row.cols.map((_, ci) => (
          <button key={ci} onClick={() => onRemove(rowIdx, ci)}
            title={`Remove column ${ci + 1}`}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontSize: 15, padding: "0 2px", lineHeight: 1 }}>×</button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppendZone — full-width drop target at canvas bottom
// ─────────────────────────────────────────────────────────────────────────────

function AppendZone({ onDrop }: { onDrop: (fn: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false);
        const p = getDrag();
        if (!p) return;
        if (p.kind === "palette" || p.kind === "meta") onDrop(p.fieldName);
        setDrag(null);
      }}
      style={{
        marginTop: 6, height: over ? 48 : 36,
        border: `2px dashed ${over ? "#7c3aed" : "var(--border)"}`,
        borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        color: over ? "#7c3aed" : "var(--muted)", fontSize: 12, fontWeight: over ? 600 : 400,
        background: over ? "#ede9fe" : "transparent",
        transition: "all 0.15s",
      }}
    >
      {over ? "Release to add as new row" : "+ Drop field here to add a new row"}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChildFormRows — accordion showing child form fields under group cells
// ─────────────────────────────────────────────────────────────────────────────

function ChildFormRows({ cols, fieldMap, childFormMap, onEditChildForm }: {
  cols: CanvasCell[];
  fieldMap: Map<string, BaseField>;
  childFormMap: Map<string, BaseField[]>;
  onEditChildForm?: (childFormName: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const entries: Array<{ pf: string; pl: string; cn: string; cf: BaseField[] }> = [];
  for (const cf of cols) {
    const base = fieldMap.get(cf.field_name);
    if (!base) continue;
    if (base.input_type !== "group" && base.input_type !== "inline-group") continue;
    const cn = cf.child_form_override || base.child_form_name_resolved || base.child_form_name || "";
    if (!cn) continue;
    const childFields = childFormMap.get(cn);
    if (!childFields?.length) continue;
    entries.push({ pf: base.field, pl: cf.label_override || base.label || base.field, cn, cf: childFields });
  }
  if (!entries.length) return null;
  return (
    <>
      {entries.map(({ pf, pl, cn, cf }) => {
        const open = expanded[pf] ?? true;
        return (
          <div key={pf} style={{ marginLeft: 48, marginBottom: 4, borderLeft: "3px solid #c4b5fd", paddingLeft: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none", flex: 1, marginBottom: open ? 3 : 0 }}
                onClick={() => setExpanded(p => ({ ...p, [pf]: !open }))}>
                <span style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {open ? "▾" : "▸"} {pl} — child form: <code style={{ color: "#7c3aed" }}>{cn}</code>
                </span>
              </div>
              {onEditChildForm && (
                <button
                  onClick={() => onEditChildForm(cn)}
                  className="btn btn-sm"
                  style={{ fontSize: 10, padding: "2px 8px", borderColor: "#c4b5fd", color: "#7c3aed", flexShrink: 0 }}
                  title={`Edit child form "${cn}"`}
                >
                  ✏ Edit
                </button>
              )}
            </div>
            {open && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {buildCanvas(cf).map((row, ri) => (
                  <div key={ri} style={{ display: "flex", gap: 3 }}>
                    {row.cols.map((ccf, ci) => {
                      const cb = cf.find(f => f.field === ccf.field_name);
                      if (!cb) return null;
                      return (
                        <div key={ci} style={{ flex: 1, opacity: 0.7 }}>
                          <FieldChip base={cb} compact />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// FieldInspector
// ─────────────────────────────────────────────────────────────────────────────

function FieldInspector({ base, cf, rowIdx, colIdx, onUpdate, onRemove, onMoveUp, onMoveDown, canUp, canDown, formList, onEditChildForm }: {
  base: BaseField; cf: CanvasCell; rowIdx: number; colIdx: number;
  onUpdate: (p: Partial<CanvasCell>) => void; onRemove: () => void;
  onMoveUp: () => void; onMoveDown: () => void; canUp: boolean; canDown: boolean;
  formList: FormListItem[];
  onEditChildForm?: (childFormName: string) => void;
}) {
  const isGroup   = base.input_type === "group" || base.input_type === "inline-group";
  const isDropdown = base.input_type === "dropdown" || base.input_type === "qualdrop_value";
  const isOnebox  = base.input_type === "onebox";

  const effRequired   = cf.required_override   ?? base.is_required;
  const effRepeatable = cf.repeatable_override ?? (base.repeatable ?? false);
  const effVocab      = cf.vocabulary_override  !== undefined ? cf.vocabulary_override : (base.vocabulary ?? "");
  const effVocabClosed = cf.vocabulary_closed_override ?? (base.vocabulary_closed ?? false);
  const effPairs      = cf.value_pairs_override !== undefined ? cf.value_pairs_override : (base.value_pairs_name ?? "");
  const effStyle      = cf.style_override       !== undefined ? cf.style_override : (base.style ?? "");
  const effTypeBind   = cf.type_bind_override   !== undefined ? cf.type_bind_override : (base.type_binds?.join(", ") ?? "");
  const effChildForm  = cf.child_form_override  !== undefined ? cf.child_form_override : (base.child_form_name_resolved ?? base.child_form_name ?? "");
  const effReadonly   = cf.readonly_override    ?? (base.readonly ?? false);

  const pairsPreview = effPairs ? (VALUE_PAIRS[effPairs] ?? []) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "#faf5ff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          <span style={{ width: 16, height: 16, borderRadius: 3, background: inputTypeBg(base.input_type), color: inputTypeColor(base.input_type), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>
            {inputIcon(base.input_type)}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: inputTypeColor(base.input_type), textTransform: "uppercase", letterSpacing: "0.07em" }}>{base.input_type}</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }}>{base.field}</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>Row {rowIdx} · Col {colIdx}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button onClick={onMoveUp} disabled={!canUp} className="btn btn-sm" style={{ flex: 1 }}>↑ Up</button>
          <button onClick={onMoveDown} disabled={!canDown} className="btn btn-sm" style={{ flex: 1 }}>↓ Down</button>
        </div>

        <Lbl>Label override</Lbl>
        <input value={cf.label_override} onChange={e => onUpdate({ label_override: e.target.value })} placeholder={base.label || base.field} style={iSt} />

        <Lbl>Hint override</Lbl>
        <textarea value={cf.hint_override} onChange={e => onUpdate({ hint_override: e.target.value })} placeholder={base.hint || "No hint"} rows={2} style={{ ...iSt, resize: "vertical" as const }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "6px 0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
            <input type="checkbox" checked={effRequired} onChange={e => onUpdate({ required_override: e.target.checked })} style={{ accentColor: "#7c3aed" }} />
            <span style={{ fontSize: 12 }}>Required</span>
            {cf.required_override !== null && cf.required_override !== undefined && <span className="chip chip-amber" style={{ fontSize: 9 }}>overridden</span>}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
            <input type="checkbox" checked={effRepeatable} onChange={e => onUpdate({ repeatable_override: e.target.checked })} style={{ accentColor: "#f97316" }} />
            <span style={{ fontSize: 12 }}>Repeatable</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
            <input type="checkbox" checked={cf.hidden} onChange={e => onUpdate({ hidden: e.target.checked })} />
            <div>
              <div style={{ fontSize: 12 }}>Hidden</div>
              <div style={{ fontSize: 9, color: "var(--muted)" }}>Still submits to DSpace</div>
            </div>
          </label>
        </div>

        {/* Vocabulary */}
        {isOnebox && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "5px 0" }} />
            <Lbl>Vocabulary</Lbl>
            <input value={effVocab} onChange={e => onUpdate({ vocabulary_override: e.target.value })} placeholder="e.g. publication-coar-types" style={iSt} />
            {effVocab && (
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", marginBottom: 5 }}>
                <input type="checkbox" checked={effVocabClosed} onChange={e => onUpdate({ vocabulary_closed_override: e.target.checked })} style={{ accentColor: "#7c3aed" }} />
                <span style={{ fontSize: 11 }}>Closed vocabulary</span>
              </label>
            )}
          </>
        )}

        {/* Value pairs */}
        {isDropdown && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "5px 0" }} />
            <Lbl>Value pairs set</Lbl>
            <select value={effPairs} onChange={e => onUpdate({ value_pairs_override: e.target.value })} style={iSt}>
              <option value="">— none —</option>
              {Object.keys(VALUE_PAIRS).map(n => (
                <option key={n} value={n}>{n} ({VALUE_PAIRS[n].length})</option>
              ))}
            </select>
            {pairsPreview.length > 0 && (
              <div style={{ background: "var(--bg)", borderRadius: 4, padding: "5px 7px", marginBottom: 5, maxHeight: 90, overflowY: "auto" }}>
                {pairsPreview.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "1px 0", borderBottom: i < pairsPreview.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span>{p.displayed_value}</span>
                    <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>{p.stored_value || "«empty»"}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Child form */}
        {isGroup && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "5px 0" }} />
            <Lbl>Child form</Lbl>
            <select value={effChildForm} onChange={e => onUpdate({ child_form_override: e.target.value })} style={iSt}>
              <option value="">— default ({base.child_form_name_resolved || base.child_form_name || "none"}) —</option>
              {formList.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
            {effChildForm && onEditChildForm && (
              <button
                onClick={() => onEditChildForm(effChildForm)}
                className="btn btn-sm btn-primary"
                style={{ width: "100%", marginBottom: 4 }}
              >
                ✏ Edit child form "{effChildForm}"
              </button>
            )}
            {!effChildForm && (base.child_form_name_resolved || base.child_form_name) && onEditChildForm && (
              <button
                onClick={() => onEditChildForm(base.child_form_name_resolved || base.child_form_name || "")}
                className="btn btn-sm"
                style={{ width: "100%", marginBottom: 4, borderColor: "#c4b5fd", color: "#7c3aed" }}
              >
                ✏ Edit default child form
              </button>
            )}
          </>
        )}

        {/* Style */}
        <div style={{ height: 1, background: "var(--border)", margin: "5px 0" }} />
        <Lbl>Column width (style)</Lbl>
        <select value={effStyle} onChange={e => onUpdate({ style_override: e.target.value })} style={iSt}>
          {ALL_STYLE_OPTIONS.map(s => <option key={s} value={s}>{s || "— default —"}</option>)}
        </select>

        {/* Type bind */}
        {isOnebox && (
          <>
            <Lbl>Type bind (comma-separated)</Lbl>
            <input value={effTypeBind} onChange={e => onUpdate({ type_bind_override: e.target.value })} placeholder="e.g. publication-coar-types:c_3248" style={iSt} />
          </>
        )}

        {/* Readonly */}
        {isOnebox && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", marginBottom: 6 }}>
            <input type="checkbox" checked={effReadonly} onChange={e => onUpdate({ readonly_override: e.target.checked })} />
            <span style={{ fontSize: 11 }}>Read-only field</span>
          </label>
        )}

        {/* Source info */}
        <div style={{ marginTop: 6, padding: "7px 9px", background: "var(--bg)", borderRadius: 5, fontSize: 11 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Source field</div>
          <InfoRow label="Base type" value={base.input_type} />
          {base.is_required && <InfoRow label="Required" value="Yes (base)" />}
          {base.vocabulary && <InfoRow label="Vocabulary" value={base.vocabulary} />}
          {base.value_pairs_name && <InfoRow label="Pairs" value={base.value_pairs_name} />}
          {base.style && <InfoRow label="Style" value={base.style} />}
          {(base.type_binds?.length ?? 0) > 0 && <InfoRow label="Type binds" value={base.type_binds!.join(", ")} />}
          {isGroup && base.child_form_name_resolved && <InfoRow label="Child form" value={base.child_form_name_resolved} />}
        </div>

        <button onClick={onRemove} className="btn btn-sm btn-danger" style={{ marginTop: 8, width: "100%" }}>Remove from canvas</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ValuePairsBrowser
// ─────────────────────────────────────────────────────────────────────────────

function ValuePairsBrowser({ canvasRows, fieldMap }: { canvasRows: CanvasRow[]; fieldMap: Map<string, BaseField> }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");

  const referencedPairs = useMemo(() => {
    const seen = new Set<string>();
    for (const row of canvasRows) {
      for (const cf of row.cols) {
        const base = fieldMap.get(cf.field_name);
        const pairs = cf.value_pairs_override ?? base?.value_pairs_name;
        if (pairs) seen.add(pairs);
      }
    }
    return Array.from(seen).filter(n => VALUE_PAIRS[n]);
  }, [canvasRows, fieldMap]);

  if (!referencedPairs.length) return null;
  const preview = selected ? (VALUE_PAIRS[selected] ?? []) : [];

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 14px", cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {open ? "▾" : "▸"} Value pairs browser
        </span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{referencedPairs.length} set{referencedPairs.length !== 1 ? "s" : ""}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 10px", display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 160, flexShrink: 0 }}>
            {referencedPairs.map(name => (
              <button key={name} onClick={() => setSelected(selected === name ? "" : name)}
                style={{ display: "flex", justifyContent: "space-between", padding: "4px 7px", borderRadius: 4, fontSize: 11, textAlign: "left", border: `1px solid ${selected === name ? "#7c3aed" : "var(--border)"}`, background: selected === name ? "#faf5ff" : "var(--surface)", color: selected === name ? "#7c3aed" : "inherit", cursor: "pointer", fontFamily: "monospace" }}>
                <span>{name}</span>
                <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "sans-serif" }}>{VALUE_PAIRS[name]?.length}</span>
              </button>
            ))}
          </div>
          {preview.length > 0 && (
            <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, overflow: "hidden", maxHeight: 140, overflowY: "auto" }}>
              <div style={{ padding: "3px 7px", background: "#f5f3ff", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, color: "#7c3aed" }}>{selected} — {preview.length} options</div>
              {preview.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 7px", fontSize: 10, borderBottom: i < preview.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span>{p.displayed_value}</span>
                  <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>{p.stored_value || "«empty»"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// XML generators
// ─────────────────────────────────────────────────────────────────────────────

function generateFormXml(formName: string, canvasRows: CanvasRow[], fieldMap: Map<string, BaseField>): string {
  const lines: string[] = [];
  lines.push(`<form name="${esc(formName)}">`);
  for (const row of canvasRows) {
    lines.push(`  <row>`);
    for (const cell of row.cols) {
      const base = fieldMap.get(cell.field_name);
      if (!base) continue;
      const parts = (base.field || cell.field_name).split(".");
      const schema    = parts[0] ?? "";
      const element   = parts[1] ?? "";
      const qualifier = parts.slice(2).join(".") ?? "";
      const label      = cell.label_override || base.label || base.field;
      const hint       = cell.hint_override  || base.hint  || "";
      const inputType  = base.input_type || "onebox";
      const repeatable = cell.repeatable_override ?? base.repeatable ?? false;
      const isRequired = cell.required_override   ?? base.is_required ?? false;
      const vocabulary = cell.vocabulary_override  !== undefined ? cell.vocabulary_override : (base.vocabulary ?? "");
      const vocabClosed = cell.vocabulary_closed_override ?? (base.vocabulary_closed ?? false);
      const valuePairs = cell.value_pairs_override !== undefined ? cell.value_pairs_override : (base.value_pairs_name ?? "");
      const childForm  = cell.child_form_override  !== undefined ? cell.child_form_override : (base.child_form_name_resolved || base.child_form_name || "");
      const style      = cell.style_override       !== undefined ? cell.style_override : (base.style || "");
      const typeBind   = cell.type_bind_override   !== undefined ? cell.type_bind_override.split(",").map(s => s.trim()).filter(Boolean) : (base.type_binds ?? []);
      const hidden     = cell.hidden;
      const readonly   = cell.readonly_override ?? (base.readonly ?? false);
      lines.push(`    <field>`);
      if (schema)    lines.push(`      <dc-schema>${esc(schema)}</dc-schema>`);
      if (element)   lines.push(`      <dc-element>${esc(element)}</dc-element>`);
      if (qualifier) lines.push(`      <dc-qualifier>${esc(qualifier)}</dc-qualifier>`);
      lines.push(`      <label>${esc(label)}</label>`);
      if (valuePairs) lines.push(`      <input-type value-pairs-name="${esc(valuePairs)}">${esc(inputType)}</input-type>`);
      else lines.push(`      <input-type>${esc(inputType)}</input-type>`);
      lines.push(`      <repeatable>${repeatable ? "true" : "false"}</repeatable>`);
      lines.push(isRequired ? `      <required>This field is required.</required>` : `      <required />`);
      if (hint)      lines.push(`      <hint>${esc(hint)}</hint>`);
      if (vocabulary) lines.push(`      <vocabulary closed="${vocabClosed ? "true" : "false"}">${esc(vocabulary)}</vocabulary>`);
      if (childForm) lines.push(`      <child-form>${esc(childForm)}</child-form>`);
      if (style)     lines.push(`      <style>${esc(style)}</style>`);
      if (hidden)    lines.push(`      <visibility>hidden</visibility>`);
      if (readonly)  lines.push(`      <readonly>true</readonly>`);
      for (const tb of typeBind) lines.push(`      <type-bind>${esc(tb)}</type-bind>`);
      if (base.language_codes?.length) lines.push(`      <language-codes>${base.language_codes.map(esc).join(",")}</language-codes>`);
      lines.push(`    </field>`);
    }
    lines.push(`  </row>`);
  }
  lines.push(`</form>`);
  return lines.join("\n");
}

function generateProcessXml(processName: string, steps: ProcessStep[], uploadAllowed: boolean): string {
  const lines: string[] = [];
  const formSteps = steps.filter(s => s.type === "submission-form");
  if (formSteps.length > 0) {
    lines.push(`<!-- Step definitions -->`);
    for (const s of formSteps) {
      lines.push(`<step-definition id="${esc(s.step_id)}" mandatory="${s.mandatory !== false}">`);
      lines.push(`  <heading>${esc(s.heading || `submit.progressbar.describe.${s.step_id}`)}</heading>`);
      lines.push(`  <processing-class>org.dspace.app.rest.submit.step.DescribeStep</processing-class>`);
      lines.push(`  <type>submission-form</type>`);
      lines.push(`</step-definition>`);
    }
    lines.push(``);
  }
  lines.push(`<submission-process name="${esc(processName)}">`);
  for (const s of steps) {
    if (s.type === "upload" && !uploadAllowed) { lines.push(`  <!-- <step id="${esc(s.step_id)}" /> (upload disabled) -->`); continue; }
    lines.push(`  <step id="${esc(s.step_id)}" />`);
  }
  lines.push(`</submission-process>`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// XmlModal
// ─────────────────────────────────────────────────────────────────────────────

function XmlModal({ title, xml, onClose }: { title: string; xml: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div style={{ background: "#1e1e2e", borderRadius: 12, width: "100%", maxWidth: 760, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{title}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Copy and paste into your DSpace config file</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(xml).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
              style={{ padding: "5px 13px", borderRadius: 6, border: "none", background: copied ? "#22c55e" : "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {copied ? "✓ Copied!" : "Copy XML"}
            </button>
            <button onClick={onClose} style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>✕</button>
          </div>
        </div>
        <pre style={{ flex: 1, overflowY: "auto", margin: 0, padding: "14px 18px", fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.6, color: "#a5f3fc", background: "transparent", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{xml}</pre>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChildFormEditorModal
// Full canvas editor for a group/inline-group child form, opened in a modal.
// Uses the same drag-and-drop canvas, field inspector, and XML export as the
// main FormEditor — but scoped to the child form fields only.
// ─────────────────────────────────────────────────────────────────────────────

function ChildFormEditorModal({ formName, formId, fieldMap: parentFieldMap, allForms, metaFields, onClose }: {
  formName: string;
  formId: number;
  fieldMap: Map<string, BaseField>;
  allForms: FormListItem[];
  metaFields: MetaField[];
  onClose: () => void;
}) {
  const [baseFields,   setBaseFields]   = useState<BaseField[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [canvasRows,   setCanvasRows]   = useState<CanvasRow[]>([]);
  const [sel,          setSel]          = useState<{ row: number; col: number } | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [showXml,      setShowXml]      = useState(false);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Load child form fields
  useEffect(() => {
    setLoading(true);
    cfetch<any>(`/submission-forms/${formId}/`)
      .then(d => { const f = d.fields ?? []; setBaseFields(f); setCanvasRows(buildCanvas(f)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [formId]);

  // Build fieldMap for child form (parent fieldMap for fallback resolution)
  const fieldMap = useMemo(() => {
    const m = new Map<string, BaseField>(baseFields.map(f => [f.field, f]));
    // Inherit parent lookups for any shared fields
    for (const [k, v] of parentFieldMap) { if (!m.has(k)) m.set(k, v); }
    return m;
  }, [baseFields, parentFieldMap]);

  const placed = useMemo(() => new Set(canvasRows.flatMap(r => r.cols.map(c => c.field_name))), [canvasRows]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  function moveRow(from: number, to: number) {
    setCanvasRows(prev => { const rows = [...prev]; const [m] = rows.splice(from, 1); rows.splice(to, 0, m); return rows; });
    if (sel) {
      if (sel.row === from) setSel({ ...sel, row: to });
      else if (from < to && sel.row > from && sel.row <= to) setSel({ ...sel, row: sel.row - 1 });
      else if (from > to && sel.row >= to && sel.row < from) setSel({ ...sel, row: sel.row + 1 });
    }
  }

  function removeField(ri: number, ci: number) {
    setCanvasRows(prev => { const rows = [...prev]; const row = { ...rows[ri], cols: [...rows[ri].cols] }; if (row.cols.length === 1) rows.splice(ri, 1); else { row.cols.splice(ci, 1); rows[ri] = row; } return rows; });
    if (sel?.row === ri && sel?.col === ci) setSel(null);
  }

  function dropOnCell(tr: number, tc: number, fn: string) {
    if (!fn || placed.has(fn)) return;
    setCanvasRows(prev => { const rows = [...prev]; const row = { ...rows[tr], cols: [...rows[tr].cols] }; const nc: CanvasCell = { field_name: fn, label_override: "", hint_override: "", hidden: false }; if (tc >= row.cols.length) row.cols = [...row.cols, nc]; else row.cols[tc] = nc; rows[tr] = row; return rows; });
  }

  function dropAsNewRow(fn: string, after?: number) {
    if (!fn || placed.has(fn)) return;
    const nr: CanvasRow = { id: uid(), cols: [{ field_name: fn, label_override: "", hint_override: "", hidden: false }] };
    setCanvasRows(prev => { const rows = [...prev]; if (after != null) rows.splice(after + 1, 0, nr); else rows.push(nr); return rows; });
  }

  function handleDrop(payload: DragPayload, targetRow: number, targetCol: number | null) {
    if (payload.kind === "palette" || payload.kind === "meta") {
      const fn = payload.fieldName;
      if (!fn || placed.has(fn)) return;
      if (targetCol == null) dropAsNewRow(fn, targetRow);
      else dropOnCell(targetRow, targetCol, fn);
    } else if (payload.kind === "cell") {
      const { rowIdx: sr, colIdx: sc } = payload;
      const dr = targetRow; const dc = targetCol ?? 0;
      if (sr === dr && sc === dc) return;
      setCanvasRows(prev => {
        const rows = prev.map(r => ({ ...r, cols: [...r.cols] }));
        const sCF = rows[sr]?.cols[sc]; const dCF = rows[dr]?.cols[dc];
        if (!sCF) return prev;
        if (dCF) { rows[sr].cols[sc] = dCF; rows[dr].cols[dc] = sCF; }
        else { rows[dr].cols[dc] = sCF; if (rows[sr].cols.length === 1) rows.splice(sr, 1); else rows[sr].cols.splice(sc, 1); }
        return rows;
      });
      setSel({ row: dr, col: dc });
    } else if (payload.kind === "row") {
      if ((payload as any).rowIdx !== targetRow) moveRow((payload as any).rowIdx, targetRow);
    }
  }

  function updateOverride(patch: Partial<CanvasCell>) {
    if (!sel) return;
    setCanvasRows(prev => prev.map((row, ri) => ri !== sel.row ? row : { ...row, cols: row.cols.map((cf, ci) => ci !== sel.col ? cf : { ...cf, ...patch }) }));
  }

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await cfetch<any>("/form-layouts/", {
        method: "POST",
        body: JSON.stringify({
          form_name: formName, collection: null, label: `${formName} child form layout`,
          sections: [{ key: "main", label: formName, sort_order: 0, collapsed_by_default: false, helper_text_above: "", helper_text_below: "",
            field_overrides: canvasRows.flatMap((row, ri) => row.cols.map((cf, ci) => ({ field_name: cf.field_name, sort_order: ri * 10 + ci, label_override: cf.label_override, hint_override: cf.hint_override, hidden: cf.hidden }))),
          }], conditional_blocks: [],
        }),
        headers: { "Content-Type": "application/json" },
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  function BetweenRowZone({ afterIdx }: { afterIdx: number }) {
    const [ov, setOv] = useState(false);
    return <div
      onDragOver={e => { e.preventDefault(); setOv(true); }}
      onDragLeave={() => setOv(false)}
      onDrop={e => {
        e.preventDefault(); setOv(false);
        const p = getDrag();
        if (!p) return;
        if (p.kind === "palette" || p.kind === "meta") dropAsNewRow(p.fieldName, afterIdx === -1 ? undefined : afterIdx);
        else if (p.kind === "row") { const from = (p as any).rowIdx; const to = from <= afterIdx ? afterIdx : afterIdx + 1; if (from !== to) moveRow(from, to); }
        setDrag(null);
      }}
      style={{ height: ov ? 20 : 3, margin: "2px 26px", borderRadius: 4, background: ov ? "#ede9fe" : "transparent", border: ov ? "2px dashed #7c3aed" : "2px dashed transparent", transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {ov && <span style={{ fontSize: 9, color: "#7c3aed", fontWeight: 600 }}>Insert row here</span>}
    </div>;
  }

  const selRow  = sel ? canvasRows[sel.row] : null;
  const selCF   = selRow?.cols[sel?.col ?? 0] ?? null;
  const selBase = selCF ? (fieldMap.get(selCF.field_name) ?? null) : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 1100, height: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", overflow: "hidden" }}>

        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "#faf5ff" }}>
          <span style={{ width: 22, height: 22, borderRadius: 5, background: "#ede9fe", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>⊞</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
              Child form: <code style={{ color: "#7c3aed" }}>{formName}</code>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
              Editing sub-form fields — drag to reorder, click to configure overrides
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{canvasRows.length} rows · {placed.size} fields</span>
          <button onClick={() => setShowXml(true)} className="btn btn-sm">&lt;/&gt; XML</button>
          <button onClick={handleSave} disabled={saving} className={`btn btn-sm ${saved ? "" : "btn-primary"}`}
            style={saved ? { background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7" } : {}}>
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Layout"}
          </button>
          <button onClick={onClose} className="btn btn-sm" style={{ marginLeft: 4 }} title="Close (Esc)">✕</button>
        </div>

        {showXml && <XmlModal title={`submission-forms.xml — <form name="${formName}">`} xml={generateFormXml(formName, canvasRows, fieldMap)} onClose={() => setShowXml(false)} />}

        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
            Loading child form…
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* LEFT: field palette with typeahead */}
            <div style={{ width: 220, borderRight: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              {/* Typeahead — covers both child form fields and all metadata */}
              <div style={{ padding: "8px 8px 6px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                  Fields — {baseFields.length} in form · {placed.size} placed
                </div>
                <FieldSearch
                  baseFields={baseFields}
                  metaFields={metaFields}
                  placed={placed}
                  onAdd={(fn, _src) => { if (!placed.has(fn)) dropAsNewRow(fn); }}
                  placeholder="Search & add fields…"
                />
              </div>
              {/* Scrollable field list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
                {baseFields.length === 0
                  ? <div style={{ fontSize: 11, color: "var(--muted)", padding: "12px 4px", fontStyle: "italic" }}>No fields found</div>
                  : baseFields.map(f => (
                    <div key={f.field}
                      draggable={!placed.has(f.field)}
                      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "palette", fieldName: f.field }); }}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => { if (!placed.has(f.field)) dropAsNewRow(f.field); }}
                      style={{ marginBottom: 3, cursor: placed.has(f.field) ? "default" : "grab", opacity: placed.has(f.field) ? 0.45 : 1 }}>
                      <FieldChip base={f} placed={placed.has(f.field)} compact />
                    </div>
                  ))
                }
              </div>
            </div>

            {/* CENTRE: canvas */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
                <div style={{ maxWidth: 580, margin: "0 auto" }}>
                  <BetweenRowZone afterIdx={-1} />
                  {canvasRows.length === 0 && (
                    <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>⊞</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Canvas is empty</div>
                      <div style={{ fontSize: 12 }}>Use the search above or click/drag fields from the left panel.</div>
                    </div>
                  )}
                  {canvasRows.map((row, ri) => (
                    <React.Fragment key={row.id}>
                      <CanvasRowCard
                        rowIdx={ri} row={row} fieldMap={fieldMap} sel={sel}
                        onSelect={(r, c) => setSel({ row: r, col: c })}
                        onDrop={handleDrop}
                        canUp={ri > 0} canDown={ri < canvasRows.length - 1}
                        onMoveRow={moveRow}
                        onRemove={removeField}
                      />
                      <BetweenRowZone afterIdx={ri} />
                    </React.Fragment>
                  ))}
                  <AppendZone onDrop={fn => dropAsNewRow(fn)} />
                </div>
              </div>
            </div>

            {/* RIGHT: inspector */}
            <div style={{ width: 240, borderLeft: "1px solid var(--border)", background: "#fff", overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
              {sel && selCF && selBase
                ? <FieldInspector
                    base={selBase} cf={selCF} rowIdx={sel.row} colIdx={sel.col}
                    onUpdate={updateOverride}
                    onRemove={() => removeField(sel.row, sel.col)}
                    onMoveUp={() => sel.row > 0 && moveRow(sel.row, sel.row - 1)}
                    onMoveDown={() => sel.row < canvasRows.length - 1 && moveRow(sel.row, sel.row + 1)}
                    canUp={sel.row > 0} canDown={sel.row < canvasRows.length - 1}
                    formList={allForms}
                  />
                : <div style={{ padding: 20, color: "var(--muted)", fontSize: 12, textAlign: "center", marginTop: 32 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>←</div>
                    Click a field to edit its properties.
                  </div>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FormEditor
// ─────────────────────────────────────────────────────────────────────────────

function FormEditor({ formId, formName, onBack, formList }: {
  formId: number; formName: string; onBack: () => void; formList: FormListItem[];
}) {
  const [baseFields,   setBaseFields]   = useState<BaseField[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [metaFields,   setMetaFields]   = useState<MetaField[]>([]);
  const [metaLoading,  setMetaLoading]  = useState(true);
  const [canvasRows,   setCanvasRows]   = useState<CanvasRow[]>([]);
  const [sel,          setSel]          = useState<{ row: number; col: number } | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [showXml,      setShowXml]      = useState(false);
  const [metaPage,     setMetaPage]     = useState(0);
  const [metaTotal,    setMetaTotal]    = useState(0);
  const [childFormModal, setChildFormModal] = useState<{ formName: string; formId: number } | null>(null);
  const META_PAGE_SIZE = 200;

  useEffect(() => {
    setLoading(true);
    cfetch<any>(`/submission-forms/${formId}/`)
      .then(d => { const f = d.fields ?? []; setBaseFields(f); setCanvasRows(buildCanvas(f)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [formId]);

  useEffect(() => {
    setMetaLoading(true);
    const q = encodeURIComponent("");
    cfetch<any>(`/metadata-fields/?q=${q}&page=${metaPage}&page_size=${META_PAGE_SIZE}`)
      .then(d => {
        const results = d?.results ?? (Array.isArray(d) ? d : []);
        if (metaPage === 0) setMetaFields(results); else setMetaFields(prev => [...prev, ...results]);
        setMetaTotal(d?.total ?? results.length);
      })
      .catch(() => {})
      .finally(() => setMetaLoading(false));
  }, [metaPage]);

  const [childFormMap, setChildFormMap]     = useState<Map<string, BaseField[]>>(new Map());
  const [childFormIdMap, setChildFormIdMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const names = new Set<string>();
    for (const f of baseFields) {
      if ((f.input_type === "group" || f.input_type === "inline-group") && (f.child_form_name_resolved || f.child_form_name))
        names.add(f.child_form_name_resolved || f.child_form_name || "");
    }
    if (!names.size) return;
    cfetch<any>("/submission-forms/").then((data: any) => {
      const forms: FormListItem[] = data;
      forms.filter(f => names.has(f.name)).forEach(form => {
        setChildFormIdMap(prev => new Map([...prev, [form.name, form.id]]));
        cfetch<any>(`/submission-forms/${form.id}/`).then((d: any) => {
          setChildFormMap(prev => new Map([...prev, [form.name, d.fields ?? []]]));
        }).catch(() => {});
      });
    }).catch(() => {});
  }, [baseFields]);

  const fieldMap = useMemo(() => {
    const m = new Map<string, BaseField>(baseFields.map(f => [f.field, f]));
    for (const cf of canvasRows.flatMap(r => r.cols)) {
      if (!m.has(cf.field_name)) {
        const meta = metaFields.find(mf => mf.field === cf.field_name);
        if (meta) m.set(cf.field_name, { id: -1, row: -1, col: -1, field: meta.field, label: meta.field, input_type: "onebox", is_required: false, vocabulary: "", value_pairs_name: "", hint: meta.scope_note || "" });
      }
    }
    return m;
  }, [baseFields, metaFields, canvasRows]);

  const placed = useMemo(() => new Set(canvasRows.flatMap(r => r.cols.map(c => c.field_name))), [canvasRows]);

  const selRow  = sel ? canvasRows[sel.row] : null;
  const selCF   = selRow?.cols[sel?.col ?? 0] ?? null;
  const selBase = selCF ? (fieldMap.get(selCF.field_name) ?? null) : null;

  function moveRow(from: number, to: number) {
    setCanvasRows(prev => { const rows = [...prev]; const [m] = rows.splice(from, 1); rows.splice(to, 0, m); return rows; });
    if (sel) {
      if (sel.row === from) setSel({ ...sel, row: to });
      else if (from < to && sel.row > from && sel.row <= to) setSel({ ...sel, row: sel.row - 1 });
      else if (from > to && sel.row >= to && sel.row < from) setSel({ ...sel, row: sel.row + 1 });
    }
  }
  function removeField(ri: number, ci: number) {
    setCanvasRows(prev => { const rows = [...prev]; const row = { ...rows[ri], cols: [...rows[ri].cols] }; if (row.cols.length === 1) { rows.splice(ri, 1); } else { row.cols.splice(ci, 1); rows[ri] = row; } return rows; });
    if (sel?.row === ri && sel?.col === ci) setSel(null);
  }

  function dropOnCell(tr: number, tc: number, fn: string) {
    if (!fn || placed.has(fn)) return;
    setCanvasRows(prev => { const rows = [...prev]; const row = { ...rows[tr], cols: [...rows[tr].cols] }; const nc: CanvasCell = { field_name: fn, label_override: "", hint_override: "", hidden: false }; if (tc >= row.cols.length) row.cols = [...row.cols, nc]; else row.cols[tc] = nc; rows[tr] = row; return rows; });
  }
  function dropAsNewRow(fn: string, after?: number) {
    if (!fn || placed.has(fn)) return;
    const nr: CanvasRow = { id: uid(), cols: [{ field_name: fn, label_override: "", hint_override: "", hidden: false }] };
    setCanvasRows(prev => { const rows = [...prev]; if (after != null) rows.splice(after + 1, 0, nr); else rows.push(nr); return rows; });
  }
  // Unified drop handler for CanvasRowCard using DragPayload
  function handleDrop(payload: DragPayload, targetRow: number, targetCol: number | null) {
    if (payload.kind === "palette" || payload.kind === "meta") {
      const fn = payload.fieldName;
      if (!fn || placed.has(fn)) return;
      if (targetCol == null) {
        // drop on row header → new row at position
        dropAsNewRow(fn, targetRow);
      } else {
        dropOnCell(targetRow, targetCol, fn);
      }
    } else if (payload.kind === "cell") {
      const { rowIdx: sr, colIdx: sc } = payload;
      const dr = targetRow;
      const dc = targetCol ?? 0;
      if (sr === dr && sc === dc) return;
      setCanvasRows(prev => {
        const rows = prev.map(r => ({ ...r, cols: [...r.cols] }));
        const sCF = rows[sr]?.cols[sc];
        const dCF = rows[dr]?.cols[dc];
        if (!sCF) return prev;
        if (dCF) {
          rows[sr].cols[sc] = dCF;
          rows[dr].cols[dc] = sCF;
        } else {
          rows[dr].cols[dc] = sCF;
          if (rows[sr].cols.length === 1) rows.splice(sr, 1);
          else rows[sr].cols.splice(sc, 1);
        }
        return rows;
      });
      setSel({ row: dr, col: dc });
    } else if (payload.kind === "row") {
      // row reorder handled in CanvasRowCard onDragOver, but handle drop-on-row too
      const { rowIdx: from } = payload;
      if (from !== targetRow) moveRow(from, targetRow);
    }
  }
  function updateOverride(patch: Partial<CanvasCell>) {
    if (!sel) return;
    setCanvasRows(prev => prev.map((row, ri) => ri !== sel.row ? row : { ...row, cols: row.cols.map((cf, ci) => ci !== sel.col ? cf : { ...cf, ...patch }) }));
  }

  function openChildFormModal(childName: string) {
    const id = childFormIdMap.get(childName);
    if (id) setChildFormModal({ formName: childName, formId: id });
  }

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await cfetch<any>("/form-layouts/", {
        method: "POST",
        body: JSON.stringify({
          form_name: formName, collection: null, label: `${formName} layout`,
          sections: [{ key: "main", label: formName, sort_order: 0, collapsed_by_default: false, helper_text_above: "", helper_text_below: "",
            field_overrides: canvasRows.flatMap((row, ri) => row.cols.map((cf, ci) => ({ field_name: cf.field_name, sort_order: ri * 10 + ci, label_override: cf.label_override, hint_override: cf.hint_override, hidden: cf.hidden }))),
          }], conditional_blocks: [],
        }),
        headers: { "Content-Type": "application/json" },
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  function BetweenRowZone({ afterIdx }: { afterIdx: number }) {
    const [ov, setOv] = useState(false);
    return <div
      onDragOver={e => { e.preventDefault(); setOv(true); }}
      onDragLeave={() => setOv(false)}
      onDrop={e => {
        e.preventDefault(); setOv(false);
        const p = getDrag();
        if (!p) return;
        if (p.kind === "palette" || p.kind === "meta") {
          dropAsNewRow(p.fieldName, afterIdx === -1 ? undefined : afterIdx);
        } else if (p.kind === "row") {
          const from = (p as any).rowIdx;
          const to = from <= afterIdx ? afterIdx : afterIdx + 1;
          if (from !== to) moveRow(from, to);
        }
        setDrag(null);
      }}
      style={{ height: ov ? 24 : 4, margin: "2px 26px", borderRadius: 4, background: ov ? "#ede9fe" : "transparent", border: ov ? "2px dashed #7c3aed" : "2px dashed transparent", transition: "all 0.12s", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {ov && <span style={{ fontSize: 9, color: "#7c3aed", fontWeight: 600 }}>Insert row here</span>}
    </div>;
  }

  if (loading) return <div style={{ padding: 40, color: "var(--muted)", fontSize: 13 }}>Loading form…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", minHeight: 500 }}>
      {/* Sub-header */}
      <div style={{ height: 46, background: "#fff", border: "1px solid var(--border)", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", padding: "0 14px", gap: 8, flexShrink: 0 }}>
        <button onClick={onBack} className="btn btn-sm">← Forms</button>
        <span style={{ color: "var(--muted)" }}>·</span>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{formName}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{canvasRows.length} rows · {placed.size} fields</span>
        <button onClick={() => setShowXml(true)} className="btn btn-sm">&lt;/&gt; XML</button>
        <button onClick={handleSave} disabled={saving} className={`btn btn-sm ${saved ? "" : "btn-primary"}`} style={saved ? { background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7" } : {}}>
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Layout"}
        </button>
      </div>

      {showXml && <XmlModal title={`submission-forms.xml — <form name="${formName}">`} xml={generateFormXml(formName, canvasRows, fieldMap)} onClose={() => setShowXml(false)} />}

      {childFormModal && (
        <ChildFormEditorModal
          formName={childFormModal.formName}
          formId={childFormModal.formId}
          fieldMap={fieldMap}
          allForms={formList}
          metaFields={metaFields}
          onClose={() => setChildFormModal(null)}
        />
      )}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", background: "#fff", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        <TypeaheadSidebar
          baseFields={baseFields} metaFields={metaFields} metaLoading={metaLoading}
          metaTotal={metaTotal} metaPage={metaPage}
          onLoadMoreMeta={() => setMetaPage(p => p + 1)}
          placed={placed}
          onDragStart={(e, fn, src) => { e.dataTransfer.effectAllowed = "move"; setDrag(src === "palette" ? { kind: "palette", fieldName: fn } : { kind: "meta", fieldName: fn }); }}
          onClickAdd={(fn, _src) => { if (!placed.has(fn)) dropAsNewRow(fn); }}
        />

        {/* Canvas */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", background: "#fff" }}>
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              <BetweenRowZone afterIdx={-1} />
              {canvasRows.length === 0 && (
                <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "48px 20px", textAlign: "center", color: "var(--muted)" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⊞</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Canvas is empty</div>
                  <div style={{ fontSize: 12 }}>Drag or click fields from the palette to add them.</div>
                </div>
              )}
              {canvasRows.map((row, ri) => (
                <React.Fragment key={row.id}>
                  <CanvasRowCard rowIdx={ri} row={row} fieldMap={fieldMap} sel={sel}
                    onSelect={(r, c) => setSel({ row: r, col: c })}
                    onDrop={handleDrop}
                    canUp={ri > 0} canDown={ri < canvasRows.length - 1}
                    onMoveRow={moveRow}
                    onRemove={removeField} />
                  <ChildFormRows cols={row.cols} fieldMap={fieldMap} childFormMap={childFormMap} onEditChildForm={openChildFormModal} />
                  <BetweenRowZone afterIdx={ri} />
                </React.Fragment>
              ))}
              <AppendZone onDrop={fn => dropAsNewRow(fn)} />
            </div>
          </div>
          <ValuePairsBrowser canvasRows={canvasRows} fieldMap={fieldMap} />
        </div>

        {/* Inspector */}
        <div style={{ width: 252, borderLeft: "1px solid var(--border)", background: "#fff", overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          {sel && selCF && selBase
            ? <FieldInspector base={selBase} cf={selCF} rowIdx={sel.row} colIdx={sel.col} onUpdate={updateOverride} onRemove={() => removeField(sel.row, sel.col)} onMoveUp={() => sel.row > 0 && moveRow(sel.row, sel.row - 1)} onMoveDown={() => sel.row < canvasRows.length - 1 && moveRow(sel.row, sel.row + 1)} canUp={sel.row > 0} canDown={sel.row < canvasRows.length - 1} formList={formList} onEditChildForm={openChildFormModal} />
            : <div style={{ padding: 20, color: "var(--muted)", fontSize: 12, textAlign: "center", marginTop: 40 }}><div style={{ fontSize: 28, marginBottom: 8 }}>←</div>Click a field to edit its properties.</div>
          }
        </div>
      </div>
    </div>  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProcessEditor
// ─────────────────────────────────────────────────────────────────────────────

type StepState = { stepId: string; formName: string; helperAbove: string; helperBelow: string; open: boolean; fields: BaseField[]; fieldsLoading: boolean };

function CollapsibleFormStep({ idx, ss, onUpdate, onEditForm }: {
  idx: number; ss: StepState;
  onUpdate: (p: Partial<StepState>) => void;
  onEditForm?: (formName: string) => void;
}) {
  const req = ss.fields.filter(f => f.is_required).length;
  return (
    <div className="card" style={{ padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => onUpdate({ open: !ss.open })}
        style={{ padding: "10px 14px", cursor: "pointer", background: ss.open ? "#faf5ff" : "var(--surface)", borderBottom: ss.open ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{ss.stepId}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
            {ss.fieldsLoading ? "Loading…" : `${ss.fields.length} field${ss.fields.length !== 1 ? "s" : ""}${req > 0 ? ` · ${req} required` : ""}`}
          </div>
        </div>
        {(ss.helperAbove || ss.helperBelow) && <span className="chip chip-amber" style={{ fontSize: 10 }}>has text</span>}
        {onEditForm && ss.fields.length > 0 && (
          <button onClick={e => { e.stopPropagation(); onEditForm(ss.formName || ss.stepId); }} className="btn btn-sm" style={{ borderColor: "#c4b5fd", color: "#7c3aed" }}>✏ Edit form</button>
        )}
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{ss.open ? "▾" : "▸"}</span>
      </div>
      {ss.open && (
        <div style={{ padding: "12px 14px" }}>
          <Lbl>Helper text above</Lbl>
          <textarea value={ss.helperAbove} onChange={e => onUpdate({ helperAbove: e.target.value })} rows={2} style={{ ...iSt, resize: "vertical" as const }} />
          <Lbl>Fields ({ss.fields.length})</Lbl>
          {ss.fieldsLoading ? <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
            : ss.fields.length === 0 ? <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>No fields.</div>
            : <div style={{ marginBottom: 8 }}>
                {Object.entries(ss.fields.reduce((acc, f) => { const k = String(f.row); if (!acc[k]) acc[k] = []; acc[k].push(f); return acc; }, {} as Record<string, BaseField[]>)).map(([rk, rf]) => (
                  <div key={rk} style={{ display: "flex", gap: 4, marginBottom: 3 }}>
                    {[...rf].sort((a, b) => a.col - b.col).map(f => <div key={f.field} style={{ flex: 1 }}><FieldChip base={f} compact /></div>)}
                  </div>
                ))}
              </div>
          }
          <Lbl>Helper text below</Lbl>
          <textarea value={ss.helperBelow} onChange={e => onUpdate({ helperBelow: e.target.value })} rows={2} style={{ ...iSt, resize: "vertical" as const }} />
        </div>
      )}
    </div>
  );
}

function ProcessEditor({ process, onBack, onEditForm }: { process: ProcessDetail; onBack: () => void; onEditForm?: (formName: string) => void }) {
  const formSteps  = useMemo(() => process.steps.filter(s => s.type === "submission-form"), [process.steps]);
  const otherSteps = useMemo(() => process.steps.filter(s => s.type !== "submission-form"), [process.steps]);
  const hasUpload  = useMemo(() => process.steps.some(s => s.type === "upload"), [process.steps]);
  const [uploadAllowed, setUploadAllowed] = useState(hasUpload);
  const [steps, setSteps] = useState<StepState[]>(() =>
    formSteps.map(s => ({ stepId: s.step_id, formName: s.step_id, helperAbove: "", helperBelow: "", open: false, fields: [], fieldsLoading: false }))
  );
  const [saved, setSaved] = useState(false);
  const [showXml, setShowXml] = useState(false);

  useEffect(() => {
    if (!formSteps.length) return;
    cfetch<any>("/submission-forms/").then((data: any) => {
      const forms: FormListItem[] = data;
      formSteps.forEach((step, idx) => {
        const match = forms.find(f => f.name === step.step_id);
        if (!match) return;
        setSteps(prev => prev.map((s, i) => i === idx ? { ...s, fieldsLoading: true } : s));
        cfetch<any>(`/submission-forms/${match.id}/`).then((fd: any) => {
          setSteps(prev => prev.map((s, i) => i === idx ? { ...s, fields: fd.fields ?? [], fieldsLoading: false, formName: match.name } : s));
        }).catch(() => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, fieldsLoading: false } : s)));
      });
    }).catch(() => {});
  }, [process.id]); // eslint-disable-line

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ height: 46, background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 14px", gap: 8, flexShrink: 0 }}>
        <button onClick={onBack} className="btn btn-sm">← Processes</button>
        <span style={{ color: "var(--muted)" }}>·</span>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{process.name}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowXml(true)} className="btn btn-sm">&lt;/&gt; XML</button>
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }} className={`btn btn-sm ${saved ? "" : "btn-primary"}`} style={saved ? { background: "#d1fae5", color: "#065f46" } : {}}>
          {saved ? "✓ Saved" : "Save Layout"}
        </button>
      </div>
      {showXml && <XmlModal title={`item-submission.xml — <submission-process name="${process.name}">`} xml={generateProcessXml(process.name, process.steps, uploadAllowed)} onClose={() => setShowXml(false)} />}

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div className="card" style={{ padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Process options</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={uploadAllowed} onChange={e => setUploadAllowed(e.target.checked)} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Allow file upload</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{hasUpload ? "Upload step present" : "Upload step not in original process"}</div>
              </div>
            </label>
          </div>
          {otherSteps.length > 0 && (
            <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Other steps (read-only)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {otherSteps.map(s => <span key={s.id} className="chip chip-gray">{s.step_id}</span>)}
              </div>
            </div>
          )}
          {formSteps.length === 0
            ? <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>No form steps in this process.</div>
            : steps.map((ss, idx) => (
                <CollapsibleFormStep key={ss.stepId} idx={idx} ss={ss}
                  onUpdate={p => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...p } : s))}
                  onEditForm={onEditForm} />
              ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function FormsTab({ initialFormName }: { initialFormName?: string }) {
  const [forms,   setForms]   = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<FormListItem | null>(null);

  useEffect(() => {
    cfetch<FormListItem[]>("/submission-forms/")
      .then(d => {
        setForms(d);
        if (initialFormName) { const m = d.find(f => f.name === initialFormName); if (m) setEditing(m); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (editing) return <FormEditor formId={editing.id} formName={editing.name} onBack={() => setEditing(null)} formList={forms} />;

  const filtered = forms.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>
          Forms <span className="count-badge">{forms.length}</span>
        </div>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter forms…"
          style={{ width: 200, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, outline: "none" }}
        />
      </div>
      {loading ? (
        <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>Loading…</div>
      ) : forms.length === 0 ? (
        <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>No forms imported yet. Run <code>import_plain_config</code>.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Form name</th>
              <th>Fields</th>
              <th>Required fields</th>
              <th>Imported</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id}>
                <td><code>{f.name}</code></td>
                <td style={{ color: "var(--muted)" }}>{f.field_count}</td>
                <td>
                  {f.contains_required
                    ? <span className="chip chip-amber">Yes</span>
                    : <span style={{ color: "var(--muted)" }}>—</span>}
                </td>
                <td style={{ fontSize: 11, color: "var(--muted)" }}>
                  {new Date(f.imported_at).toLocaleDateString()}
                </td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => setEditing(f)}>
                    ✏ Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProcessesTab({ onEditForm }: { onEditForm?: (formName: string) => void }) {
  const [processes, setProcesses] = useState<ProcessListItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState<ProcessDetail | null>(null);

  useEffect(() => {
    cfetch<ProcessListItem[]>("/submission-processes/")
      .then(d => setProcesses(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function open(item: ProcessListItem) {
    cfetch<ProcessDetail>(`/submission-processes/${item.id}/`)
      .then(d => setEditing(d))
      .catch(() => {});
  }

  if (editing) return <ProcessEditor process={editing} onBack={() => setEditing(null)} onEditForm={onEditForm} />;

  return (
    <div className="card">
      <div className="card-title">
        Processes <span className="count-badge">{processes.length}</span>
      </div>
      {loading ? (
        <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>Loading…</div>
      ) : processes.length === 0 ? (
        <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>No processes imported yet. Run <code>import_plain_config</code>.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Process name</th>
              <th>Steps</th>
              <th>Imported</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {processes.map(p => (
              <tr key={p.id}>
                <td><code>{p.name}</code></td>
                <td style={{ color: "var(--muted)" }}>{p.step_count}</td>
                <td style={{ fontSize: 11, color: "var(--muted)" }}>
                  {new Date(p.imported_at).toLocaleDateString()}
                </td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => open(p)}>
                    ✏ Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FormBuilderPage — exported page component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Pre-select a form by name (set when navigating from Processes page). */
  initialFormName?: string;
}

export function FormBuilderPage({ initialFormName }: Props) {
  const [activeTab, setActiveTab] = useState<"forms" | "processes">("forms");
  const [crossNavForm, setCrossNavForm] = useState<string | undefined>(initialFormName);

  function handleEditForm(formName: string) {
    setCrossNavForm(formName);
    setActiveTab("forms");
  }

  return (
    <div>
      <PageHeader
        title="Form Builder"
        desc="Visual drag-and-drop editor for submission form field layout, overrides, and process configuration."
      />

      {/* Pill tab bar — matches MetadataPage Schemas / Field Search style */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
        {(["forms", "processes"] as const).map((tab, i) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab === "forms") setCrossNavForm(undefined); }}
            style={{
              padding: "7px 18px", fontSize: 13, fontWeight: 600,
              borderRadius: i === 0 ? "8px 0 0 8px" : "0 8px 8px 0",
              border: "1px solid",
              borderColor: activeTab === tab ? "var(--accent)" : "#e2e8f0",
              background: activeTab === tab ? "var(--accent)" : "#fff",
              color: activeTab === tab ? "#fff" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {tab === "forms" ? "📋 Submission Forms" : "🔄 Submission Processes"}
          </button>
        ))}
      </div>

      {activeTab === "forms" && (
        <FormsTab key={crossNavForm ?? ""} initialFormName={crossNavForm} />
      )}
      {activeTab === "processes" && (
        <ProcessesTab onEditForm={handleEditForm} />
      )}
    </div>
  );
}
