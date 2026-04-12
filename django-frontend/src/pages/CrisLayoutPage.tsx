import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import {
  Alert, EmptyState, FormGroup, LoadingBlock,
  Modal, ModalActions, PageHeader, Spinner, useNotice,
} from "../components/shared";

const BASE = "/api/dspace-config/cris-layout";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrisTab {
  id: number; entity: string; shortname: string; label: string;
  priority: number; leading: boolean; security: string;
}
interface Tab2Box {
  id: number; entity: string; tab: string; row: number;
  row_style: string; cell_style: string; boxes: string; box_list: string[];
}
interface BoxField {
  id: number; entity: string; box: string; row: number; cell: number;
  field_type: string; metadata: string; value: string; bundle: string;
  label: string; label_as_heading: boolean; rendering: string;
  values_inline: boolean; row_style: string; cell_style: string;
  style_label: string; style_value: string;
}
interface BoxMetrics {
  id: number; entity: string; box: string; metric_type: string; metric_list: string[];
}
interface CrisBox {
  id: number; entity: string; shortname: string; label: string;
  box_type: string; collapsed: boolean; container: boolean;
  minor: boolean; security: string; style: string;
  fields_data: BoxField[]; metrics: BoxMetrics | null; policies: any[];
}
interface MetadataGroup {
  id: number; entity: string; parent: string; field_type: string;
  metadata: string; value: string; bundle: string;
  label: string; rendering: string; style_label: string; style_value: string;
}
interface EntityLayout {
  entity: string; tabs: CrisTab[]; tab2box: Tab2Box[];
  boxes: CrisBox[]; metadata_groups: MetadataGroup[]; tab_policies: any[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECURITY_OPTIONS = [
  "PUBLIC", "ADMINISTRATOR", "OWNER ONLY",
  "OWNER & ADMINISTRATOR", "CUSTOM DATA", "CUSTOM DATA & ADMINISTRATOR",
];
const BOX_TYPE_OPTIONS = ["METADATA","RELATION","METRICS","IIIFVIEWER","NETWORKLAB","BITSTREAM"];
const FIELD_TYPE_OPTIONS = ["METADATA","BITSTREAM","METADATAGROUP"];
const RENDERING_OPTIONS = [
  "","heading","text","longtext","longhtml","date","link","link.label",
  "identifier","identifier.doi","identifier.ror","identifier.scopus","orcid",
  "crisref","crisref.email","thumbnail","attachment","tag","inline","table",
  "advancedattachment","valuepair.event_types","valuepair.funding_types",
  "valuepair.publication-coar-types","valuepair.product-coar-types",
  "valuepair.patent-coar-types","valuepair.common_iso_languages",
];

const BOX_TYPE_COLORS: Record<string, string> = {
  METADATA:   "#dbeafe",
  RELATION:   "#dcfce7",
  METRICS:    "#fef3c7",
  IIIFVIEWER: "#ede9fe",
  NETWORKLAB: "#fce7f3",
  BITSTREAM:  "#f1f5f9",
};
const BOX_TYPE_TEXT: Record<string, string> = {
  METADATA:   "#1e40af",
  RELATION:   "#166534",
  METRICS:    "#92400e",
  IIIFVIEWER: "#5b21b6",
  NETWORKLAB: "#9d174d",
  BITSTREAM:  "#334155",
};

function boxTypeChip(type: string) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 99,
      fontSize: 10, fontWeight: 700,
      background: BOX_TYPE_COLORS[type] ?? "#f1f5f9",
      color: BOX_TYPE_TEXT[type] ?? "#334155",
    }}>
      {type}
    </span>
  );
}

function secChip(sec: string) {
  const isPublic = sec === "PUBLIC";
  return (
    <span className={`chip ${isPublic ? "chip-green" : "chip-amber"}`} style={{ fontSize: 10 }}>
      {sec}
    </span>
  );
}

// ── Field row inside a box ────────────────────────────────────────────────────

function FieldRow({
  field, onEdit, onDelete, dragging,
  onDragStart, onDragEnd, onDrop,
}: {
  field: BoxField;
  onEdit: (f: BoxField) => void;
  onDelete: (f: BoxField) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{ opacity: dragging ? 0.4 : 1, cursor: "grab" }}
    >
      <td style={{ color: "var(--muted)", fontSize: 11, width: 28 }}>⠿</td>
      <td style={{ color: "var(--muted)", fontSize: 11 }}>{field.row}/{field.cell}</td>
      <td>
        <span className="chip chip-gray" style={{ fontSize: 10 }}>{field.field_type}</span>
      </td>
      <td><code style={{ fontSize: 11 }}>{field.metadata || "—"}</code></td>
      <td style={{ fontSize: 12 }}>{field.label}</td>
      <td>
        {field.rendering && (
          <span className="chip chip-blue" style={{ fontSize: 10 }}>{field.rendering}</span>
        )}
      </td>
      <td>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-sm" onClick={() => onEdit(field)} style={{ padding: "2px 8px" }}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(field)} style={{ padding: "2px 8px" }}>✕</button>
        </div>
      </td>
    </tr>
  );
}

// ── Box card ──────────────────────────────────────────────────────────────────

function BoxCard({
  box, expanded, onToggle, onEdit, onDelete,
  onAddField, onEditField, onDeleteField, onReorderFields,
}: {
  box: CrisBox;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (b: CrisBox) => void;
  onDelete: (b: CrisBox) => void;
  onAddField: (b: CrisBox) => void;
  onEditField: (b: CrisBox, f: BoxField) => void;
  onDeleteField: (b: CrisBox, f: BoxField) => void;
  onReorderFields: (b: CrisBox, newOrder: BoxField[]) => void;
}) {
  const dragIdx = useRef<number | null>(null);

  function handleDrop(targetIdx: number) {
    if (dragIdx.current === null || dragIdx.current === targetIdx) return;
    const reordered = [...box.fields_data];
    const [moved] = reordered.splice(dragIdx.current, 1);
    reordered.splice(targetIdx, 0, moved);
    // Re-assign row numbers
    const renumbered = reordered.map((f, i) => ({ ...f, row: i + 1 }));
    onReorderFields(box, renumbered);
    dragIdx.current = null;
  }


  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10, marginBottom: 10,
      background: "#fff", overflow: "hidden",
    }}>
      {/* Box header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", cursor: "pointer",
          background: expanded ? "#f0f6ff" : "#fafcff",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted)", width: 14, flexShrink: 0 }}>
          {expanded ? "▼" : "▶"}
        </span>
        {boxTypeChip(box.box_type)}
        <strong style={{ fontSize: 13, flex: 1 }}>
          {box.shortname}
          {box.label && <span style={{ color: "var(--muted)", fontWeight: 400 }}> — {box.label}</span>}
        </strong>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          {secChip(box.security)}
          {box.collapsed && <span className="chip chip-gray" style={{ fontSize: 10 }}>collapsed</span>}
          {box.minor   && <span className="chip chip-gray" style={{ fontSize: 10 }}>minor</span>}
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {box.fields_data.length} field{box.fields_data.length !== 1 ? "s" : ""}
          </span>
          <button className="btn btn-sm" style={{ padding: "2px 8px" }}
            onClick={(e) => { e.stopPropagation(); onEdit(box); }}>Edit</button>
          <button className="btn btn-sm btn-danger" style={{ padding: "2px 8px" }}
            onClick={(e) => { e.stopPropagation(); onDelete(box); }}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "12px 14px" }}>
          {/* Metrics */}
          {box.metrics && (
            <div style={{ marginBottom: 10, padding: "6px 10px", background: "#fef9ec", borderRadius: 6, border: "1px solid #fcd34d", fontSize: 12 }}>
              <strong style={{ color: "#92400e" }}>Metric types: </strong>
              <span style={{ color: "#78350f" }}>{box.metrics.metric_type}</span>
            </div>
          )}

          {/* Fields table */}
          {box.fields_data.length > 0 ? (
            <table style={{ marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Row/Cell</th>
                  <th>Type</th>
                  <th>Metadata</th>
                  <th>Label</th>
                  <th>Rendering</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {box.fields_data.map((f, idx) => (
                  <FieldRow
                    key={f.id} field={f}
                    dragging={false}
                    onDragStart={() => { dragIdx.current = idx; }}
                    onDragEnd={() => { dragIdx.current = null; }}
                    onDrop={() => handleDrop(idx)}
                    onEdit={(f) => onEditField(box, f)}
                    onDelete={(f) => onDeleteField(box, f)}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>No fields yet.</div>
          )}

          <button className="btn btn-sm btn-primary" onClick={() => onAddField(box)}>
            + Add Field
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab panel ─────────────────────────────────────────────────────────────────

function TabPanel({
  tab, tab2box, boxes,
  onEditTab, onDeleteTab,
  onEditBox, onDeleteBox, onAddBox, onAddField, onEditField, onDeleteField, onReorderFields,
}: {
  tab: CrisTab;
  tab2box: Tab2Box[];
  boxes: CrisBox[];
  onEditTab: (t: CrisTab) => void;
  onDeleteTab: (t: CrisTab) => void;
  onEditBox: (b: CrisBox) => void;
  onDeleteBox: (b: CrisBox) => void;
  onAddBox: (tab: string) => void;
  onAddField: (b: CrisBox) => void;
  onEditField: (b: CrisBox, f: BoxField) => void;
  onDeleteField: (b: CrisBox, f: BoxField) => void;
  onReorderFields: (b: CrisBox, fields: BoxField[]) => void;
}) {
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set());

  // Get boxes for this tab in row order
  const tabMappings = tab2box.filter(t => t.tab === tab.shortname).sort((a, b) => a.row - b.row);
  const boxShortnames = tabMappings.flatMap(m => m.box_list);
  const tabBoxes = boxShortnames
    .map(sn => boxes.find(b => b.shortname === sn))
    .filter((b): b is CrisBox => !!b);

  function toggleBox(id: number) {
    setExpandedBoxes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div style={{ padding: "14px 0" }}>
      {/* Tab header bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", background: "#f0f6ff",
        borderRadius: 8, marginBottom: 14, border: "1px solid var(--border)",
      }}>
        {tab.leading && (
          <span className="chip chip-blue" style={{ fontSize: 10 }}>leading</span>
        )}
        <strong style={{ fontSize: 14, flex: 1 }}>{tab.label || tab.shortname}</strong>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>priority {tab.priority}</span>
        {secChip(tab.security)}
        <button className="btn btn-sm" onClick={() => onEditTab(tab)}>Edit Tab</button>
        <button className="btn btn-sm btn-danger" onClick={() => onDeleteTab(tab)}>Delete Tab</button>
      </div>

      {tabBoxes.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)", paddingLeft: 16, marginBottom: 10 }}>
          No boxes assigned to this tab.
        </div>
      ) : (
        tabBoxes.map(box => (
          <BoxCard
            key={box.id}
            box={box}
            expanded={expandedBoxes.has(box.id)}
            onToggle={() => toggleBox(box.id)}
            onEdit={onEditBox}
            onDelete={onDeleteBox}
            onAddField={onAddField}
            onEditField={onEditField}
            onDeleteField={onDeleteField}
            onReorderFields={onReorderFields}
          />
        ))
      )}
      <button className="btn btn-sm btn-primary" style={{ marginTop: 4 }}
        onClick={() => onAddBox(tab.shortname)}>
        + Add Box to Tab
      </button>
    </div>
  );
}


// ── MetadataFieldTypeahead ─────────────────────────────────────────────────────

const META_BASE = "/api/dspace-config";

function MetadataFieldTypeahead({
  value,
  onChange,
  placeholder = "e.g. dc.title, dc.contributor.author",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ id: number; field: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // sync external value → local query when modal resets
  useEffect(() => { setQuery(value); }, [value]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInput(v: string) {
    setQuery(v);
    onChange(v);
    if (debounce.current) clearTimeout(debounce.current);
    if (!v.trim()) { setSuggestions([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ id: number; field: string }[]>(
          `${META_BASE}/metadata-fields/?q=${encodeURIComponent(v)}`
        );
        setSuggestions(res.slice(0, 12));
        setOpen(res.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 220);
  }

  function pick(field: string) {
    setQuery(field);
    onChange(field);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (suggestions.length) setOpen(true); }}
          placeholder={placeholder}
          style={{ width: "100%", paddingRight: loading ? 28 : undefined }}
        />
        {loading && (
          <span style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "var(--muted)",
          }}>…</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul style={{
          position: "absolute", zIndex: 9999, top: "100%", left: 0, right: 0,
          background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          margin: 0, padding: "4px 0", listStyle: "none",
          maxHeight: 200, overflowY: "auto",
        }}>
          {suggestions.map(s => (
            <li
              key={s.id}
              onMouseDown={() => pick(s.field)}
              style={{
                padding: "6px 12px", fontSize: 12, cursor: "pointer",
                fontFamily: "monospace", color: "#1e293b",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {s.field}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Field edit modal ──────────────────────────────────────────────────────────

const EMPTY_FIELD: Partial<BoxField> = {
  field_type: "METADATA", metadata: "", value: "", bundle: "", label: "",
  label_as_heading: false, rendering: "", values_inline: false,
  row_style: "", cell_style: "", style_label: "font-weight-bold col-3", style_value: "",
  row: 1, cell: 1,
};

function FieldModal({ box, field, onClose, onSaved }: {
  box: CrisBox; field: BoxField | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<BoxField>>(field ?? { ...EMPTY_FIELD, entity: box.entity, box: box.shortname });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(p: Partial<BoxField>) { setForm(f => ({ ...f, ...p })); }

  async function save() {
    setSaving(true); setError("");
    try {
      if (field) {
        await apiFetch(`${BASE}/box-fields/${field.id}/`, { method: "PATCH", body: form });
      } else {
        await apiFetch(`${BASE}/box-fields/`, { method: "POST", body: { ...form, entity: box.entity, box: box.shortname } });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.detail ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={field ? "Edit Field" : "Add Field"} onClose={onClose} wide>
      {error && <Alert type="error">{error}</Alert>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        <FormGroup label="Row">
          <input type="number" value={form.row ?? 1} onChange={e => set({ row: +e.target.value })} />
        </FormGroup>
        <FormGroup label="Cell">
          <input type="number" value={form.cell ?? 1} onChange={e => set({ cell: +e.target.value })} />
        </FormGroup>
        <FormGroup label="Field Type">
          <select value={form.field_type} onChange={e => set({ field_type: e.target.value })}>
            {FIELD_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Values Inline">
          <select value={form.values_inline ? "y" : "n"} onChange={e => set({ values_inline: e.target.value === "y" })}>
            <option value="n">No</option><option value="y">Yes</option>
          </select>
        </FormGroup>
      </div>
      <FormGroup label="Metadata field" hint="Start typing to search the metadata registry">
        <MetadataFieldTypeahead
          value={form.metadata ?? ""}
          onChange={v => set({ metadata: v })}
        />
      </FormGroup>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Value" hint="Filter value for BITSTREAM types">
          <input type="text" value={form.value ?? ""} onChange={e => set({ value: e.target.value })} />
        </FormGroup>
        <FormGroup label="Bundle" hint="e.g. ORIGINAL">
          <input type="text" value={form.bundle ?? ""} onChange={e => set({ bundle: e.target.value })} />
        </FormGroup>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Label">
          <input type="text" value={form.label ?? ""} onChange={e => set({ label: e.target.value })} />
        </FormGroup>
        <FormGroup label="Rendering">
          <select value={form.rendering ?? ""} onChange={e => set({ rendering: e.target.value })}>
            {RENDERING_OPTIONS.map(o => <option key={o} value={o}>{o || "(none)"}</option>)}
          </select>
        </FormGroup>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <FormGroup label="Row Style">
          <input type="text" value={form.row_style ?? ""} onChange={e => set({ row_style: e.target.value })} />
        </FormGroup>
        <FormGroup label="Cell Style">
          <input type="text" value={form.cell_style ?? ""} onChange={e => set({ cell_style: e.target.value })} />
        </FormGroup>
        <FormGroup label="Style Label" hint="CSS classes for the label cell">
          <input type="text" value={form.style_label ?? ""} onChange={e => set({ style_label: e.target.value })} />
        </FormGroup>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={!!form.label_as_heading}
            onChange={e => set({ label_as_heading: e.target.checked })} />
          Label as heading
        </label>
      </div>
      <ModalActions>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Spinner white /> Saving…</> : "Save Field"}
        </button>
      </ModalActions>
    </Modal>
  );
}


// ── Metadata group modal (Create / Edit) ──────────────────────────────────────

const EMPTY_GROUP: Partial<MetadataGroup> = {
  field_type: "METADATA", parent: "", metadata: "",
  value: "", bundle: "", label: "", rendering: "", style_label: "", style_value: "",
};

function MetadataGroupModal({ entity, group, onClose, onSaved }: {
  entity: string; group: MetadataGroup | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<MetadataGroup>>(
    group ? { ...group } : { ...EMPTY_GROUP, entity }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(p: Partial<MetadataGroup>) { setForm(f => ({ ...f, ...p })); }

  async function save() {
    setSaving(true); setError("");
    try {
      if (group) {
        await apiFetch(`${BASE}/metadata-groups/${group.id}/`, { method: "PATCH", body: form });
      } else {
        await apiFetch(`${BASE}/metadata-groups/`, { method: "POST", body: { ...form, entity } });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.detail ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={group ? "Edit Metadata Group" : "Add Metadata Group"} onClose={onClose} wide>
      {error && <Alert type="error">{error}</Alert>}

      <FormGroup label="Parent field" hint="The metadata field that acts as the group key (e.g. dc.contributor.author)">
        <MetadataFieldTypeahead
          value={form.parent ?? ""}
          onChange={v => set({ parent: v })}
          placeholder="e.g. dc.contributor.author"
        />
      </FormGroup>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Field Type">
          <select value={form.field_type} onChange={e => set({ field_type: e.target.value })}>
            {FIELD_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Rendering">
          <select value={form.rendering ?? ""} onChange={e => set({ rendering: e.target.value })}>
            {RENDERING_OPTIONS.map(o => <option key={o} value={o}>{o || "(none)"}</option>)}
          </select>
        </FormGroup>
      </div>

      <FormGroup label="Metadata field" hint="The child metadata field within the group">
        <MetadataFieldTypeahead
          value={form.metadata ?? ""}
          onChange={v => set({ metadata: v })}
          placeholder="e.g. oairecerif.author.affiliation"
        />
      </FormGroup>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Value" hint="Fixed value / dc.type filter for BITSTREAM types">
          <input type="text" value={form.value ?? ""} onChange={e => set({ value: e.target.value })} />
        </FormGroup>
        <FormGroup label="Bundle" hint="e.g. ORIGINAL">
          <input type="text" value={form.bundle ?? ""} onChange={e => set({ bundle: e.target.value })} />
        </FormGroup>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Label">
          <input type="text" value={form.label ?? ""} onChange={e => set({ label: e.target.value })} />
        </FormGroup>
        <FormGroup label="Style Label" hint="CSS classes for the label cell">
          <input type="text" value={form.style_label ?? ""} onChange={e => set({ style_label: e.target.value })} />
        </FormGroup>
      </div>
      <FormGroup label="Style Value" hint="CSS classes for the value cell">
        <input type="text" value={form.style_value ?? ""} onChange={e => set({ style_value: e.target.value })} />
      </FormGroup>

      <ModalActions>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Spinner white /> Saving…</> : group ? "Save Changes" : "Add Group"}
        </button>
      </ModalActions>
    </Modal>
  );
}

// ── Box edit modal ────────────────────────────────────────────────────────────

function BoxModal({ entity, box, onClose, onSaved }: {
  entity: string; box: CrisBox | null; onClose: () => void; onSaved: () => void;
}) {
  const empty = { entity, shortname: "", label: "", box_type: "METADATA", collapsed: false, container: true, minor: false, security: "PUBLIC", style: "" };
  const [form, setForm] = useState(box ? {
    entity: box.entity, shortname: box.shortname, label: box.label,
    box_type: box.box_type, collapsed: box.collapsed, container: box.container,
    minor: box.minor, security: box.security, style: box.style,
  } : empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(p: any) { setForm(f => ({ ...f, ...p })); }

  async function save() {
    setSaving(true); setError("");
    try {
      if (box) {
        await apiFetch(`${BASE}/boxes/${box.id}/`, { method: "PATCH", body: form });
      } else {
        await apiFetch(`${BASE}/boxes/`, { method: "POST", body: form });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.detail ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={box ? "Edit Box" : "New Box"} onClose={onClose}>
      {error && <Alert type="error">{error}</Alert>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Shortname"><input type="text" value={form.shortname} onChange={e => set({ shortname: e.target.value })} /></FormGroup>
        <FormGroup label="Box Type">
          <select value={form.box_type} onChange={e => set({ box_type: e.target.value })}>
            {BOX_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </FormGroup>
      </div>
      <FormGroup label="Label"><input type="text" value={form.label} onChange={e => set({ label: e.target.value })} /></FormGroup>
      <FormGroup label="Security">
        <select value={form.security} onChange={e => set({ security: e.target.value })}>
          {SECURITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Style (CSS class)"><input type="text" value={form.style} onChange={e => set({ style: e.target.value })} /></FormGroup>
      <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
        {[["collapsed","Collapsed"],["container","Container"],["minor","Minor"]].map(([k,l]) => (
          <label key={k} style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={!!(form as any)[k]} onChange={e => set({ [k]: e.target.checked })} /> {l}
          </label>
        ))}
      </div>
      <ModalActions>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Spinner white /> Saving…</> : "Save Box"}
        </button>
      </ModalActions>
    </Modal>
  );
}

// ── Tab edit modal ────────────────────────────────────────────────────────────

function TabModal({ entity, tab, onClose, onSaved }: {
  entity: string; tab: CrisTab | null; onClose: () => void; onSaved: () => void;
}) {
  const empty = { entity, shortname: "", label: "", priority: 0, leading: false, security: "PUBLIC" };
  const [form, setForm] = useState(tab ? {
    entity: tab.entity, shortname: tab.shortname, label: tab.label,
    priority: tab.priority, leading: tab.leading, security: tab.security,
  } : empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(p: any) { setForm(f => ({ ...f, ...p })); }

  async function save() {
    setSaving(true); setError("");
    try {
      if (tab) {
        await apiFetch(`${BASE}/tabs/${tab.id}/`, { method: "PATCH", body: form });
      } else {
        await apiFetch(`${BASE}/tabs/`, { method: "POST", body: form });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.detail ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={tab ? "Edit Tab" : "New Tab"} onClose={onClose}>
      {error && <Alert type="error">{error}</Alert>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormGroup label="Shortname"><input type="text" value={form.shortname} onChange={e => set({ shortname: e.target.value })} /></FormGroup>
        <FormGroup label="Priority"><input type="number" value={form.priority} onChange={e => set({ priority: +e.target.value })} /></FormGroup>
      </div>
      <FormGroup label="Label"><input type="text" value={form.label} onChange={e => set({ label: e.target.value })} /></FormGroup>
      <FormGroup label="Security">
        <select value={form.security} onChange={e => set({ security: e.target.value })}>
          {SECURITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
      </FormGroup>
      <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer", fontSize: 13, marginTop: 6 }}>
        <input type="checkbox" checked={form.leading} onChange={e => set({ leading: e.target.checked })} /> Leading (default) tab
      </label>
      <ModalActions>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Spinner white /> Saving…</> : "Save Tab"}
        </button>
      </ModalActions>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CrisLayoutPage() {
  const [entities, setEntities] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [layout, setLayout] = useState<EntityLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  // Modals
  const [tabModal, setTabModal] = useState<{ open: boolean; tab: CrisTab | null }>({ open: false, tab: null });
  const [boxModal, setBoxModal] = useState<{ open: boolean; box: CrisBox | null }>({ open: false, box: null });
  const [fieldModal, setFieldModal] = useState<{ open: boolean; box: CrisBox | null; field: BoxField | null }>({ open: false, box: null, field: null });
  const [groupModal, setGroupModal] = useState<{ open: boolean; group: MetadataGroup | null }>({ open: false, group: null });

  const { notice, notify } = useNotice();

  // Load entity list
  useEffect(() => {
    apiFetch<{ entities: string[] }>(`${BASE}/entities/`)
      .then(d => setEntities(d.entities))
      .catch(() => {});
  }, []);

  // Load entity layout
  const loadLayout = useCallback(async (entity: string) => {
    if (!entity) return;
    setLoading(true);
    try {
      const data = await apiFetch<EntityLayout>(`${BASE}/entities/${entity}/`);
      setLayout(data);
      if (!activeTab && data.tabs.length) setActiveTab(data.tabs[0].shortname);
    } catch {
      notify("error", "Failed to load layout.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]); // eslint-disable-line

  useEffect(() => {
    if (selectedEntity) { setActiveTab(""); loadLayout(selectedEntity); }
  }, [selectedEntity]); // eslint-disable-line

  async function exportXls() {
    setExporting(true);
    try {
      const url = `${BASE}/export/${selectedEntity ? `?entity=${selectedEntity}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `cris-layout-configuration${selectedEntity ? `-${selectedEntity}` : ""}.xlsx`;
      a.click();
    } catch {
      notify("error", "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteTab(tab: CrisTab) {
    if (!confirm(`Delete tab "${tab.label || tab.shortname}"?`)) return;
    try {
      await apiFetch(`${BASE}/tabs/${tab.id}/`, { method: "DELETE" });
      notify("success", "Tab deleted.");
      loadLayout(selectedEntity);
    } catch { notify("error", "Delete failed."); }
  }

  async function deleteBox(box: CrisBox) {
    if (!confirm(`Delete box "${box.shortname}" and all its fields?`)) return;
    try {
      await apiFetch(`${BASE}/boxes/${box.id}/`, { method: "DELETE" });
      notify("success", "Box deleted.");
      loadLayout(selectedEntity);
    } catch { notify("error", "Delete failed."); }
  }

  async function deleteField(box: CrisBox, field: BoxField) {
    if (!confirm(`Remove field "${field.metadata || field.field_type}" from box "${box.shortname}"?`)) return;
    try {
      await apiFetch(`${BASE}/box-fields/${field.id}/`, { method: "DELETE" });
      notify("success", "Field removed.");
      loadLayout(selectedEntity);
    } catch { notify("error", "Delete failed."); }
  }

  async function reorderFields(_box: CrisBox, newOrder: BoxField[]) {
    // PATCH each field with its new row number
    try {
      await Promise.all(
        newOrder.map((f, i) =>
          apiFetch(`${BASE}/box-fields/${f.id}/`, { method: "PATCH", body: { row: i + 1 } })
        )
      );
      loadLayout(selectedEntity);
    } catch { notify("error", "Reorder failed."); }
  }

  async function deleteGroup(group: MetadataGroup) {
    if (!confirm(`Delete metadata group entry for parent "${group.parent}" / "${group.metadata}"?`)) return;
    try {
      await apiFetch(`${BASE}/metadata-groups/${group.id}/`, { method: "DELETE" });
      notify("success", "Metadata group entry deleted.");
      loadLayout(selectedEntity);
    } catch { notify("error", "Delete failed."); }
  }

  const currentTab = layout?.tabs.find(t => t.shortname === activeTab) ?? null;

  return (
    <div>
      <PageHeader
        title="CRIS Layout Configuration"
        desc="Visual editor for the DSpace CRIS entity layout — tabs, boxes, and metadata fields. Export as XLS when done."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {selectedEntity && (
              <>
                <button className="btn btn-primary" onClick={() => setTabModal({ open: true, tab: null })}>
                  + New Tab
                </button>
                <button className="btn" onClick={exportXls} disabled={exporting}>
                  {exporting ? <><Spinner /> Exporting…</> : "⬇ Download XLS"}
                </button>
              </>
            )}
            {!selectedEntity && (
              <button className="btn" onClick={exportXls} disabled={exporting}>
                {exporting ? <><Spinner /> Exporting…</> : "⬇ Download All XLS"}
              </button>
            )}
          </div>
        }
      />

      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}

      {/* Entity selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <label style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)" }}>Entity:</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entities.map(e => (
            <button
              key={e}
              className={`btn${selectedEntity === e ? " btn-primary" : ""}`}
              style={{ padding: "5px 14px", fontSize: 13 }}
              onClick={() => setSelectedEntity(e)}
            >
              {e}
            </button>
          ))}
          {entities.length === 0 && (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              No entities found — run <code>import_cris_layout</code> first.
            </span>
          )}
        </div>
      </div>

      {/* Layout editor */}
      {!selectedEntity ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 15, color: "var(--muted)" }}>
            ← Select an entity to start editing its layout
          </div>
        </div>
      ) : loading ? (
        <LoadingBlock label={`Loading ${selectedEntity} layout…`} />
      ) : layout ? (
        <>
          {/* Tab pills */}
          <div style={{
            display: "flex", gap: 4, flexWrap: "wrap",
            background: "#f0f4f9", padding: "6px 8px",
            borderRadius: 10, marginBottom: 16,
          }}>
            {layout.tabs.sort((a, b) => a.priority - b.priority).map(tab => (
              <button
                key={tab.shortname}
                onClick={() => setActiveTab(tab.shortname)}
                style={{
                  padding: "6px 14px", borderRadius: 7, border: "none",
                  fontWeight: 600, fontSize: 12, cursor: "pointer",
                  background: activeTab === tab.shortname ? "#fff" : "transparent",
                  color: activeTab === tab.shortname ? "var(--accent)" : "var(--muted)",
                  boxShadow: activeTab === tab.shortname ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {tab.label || tab.shortname}
                {tab.leading && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>★</span>}
              </button>
            ))}
          </div>

          {/* Active tab content */}
          {currentTab ? (
            <TabPanel
              tab={currentTab}
              tab2box={layout.tab2box}
              boxes={layout.boxes}
              onEditTab={(t) => setTabModal({ open: true, tab: t })}
              onDeleteTab={deleteTab}
              onEditBox={(b) => setBoxModal({ open: true, box: b })}
              onDeleteBox={deleteBox}
              onAddBox={() => setBoxModal({ open: true, box: null })}
              onAddField={(b) => setFieldModal({ open: true, box: b, field: null })}
              onEditField={(b, f) => setFieldModal({ open: true, box: b, field: f })}
              onDeleteField={deleteField}
              onReorderFields={reorderFields}
            />
          ) : (
            <EmptyState msg="Select a tab above, or create a new one." />
          )}

          {/* Metadata groups — full CRUD */}
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>
                Metadata Groups{" "}
                <span className="count-badge">{layout.metadata_groups.length}</span>
              </div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => setGroupModal({ open: true, group: null })}
              >
                + Add Group
              </button>
            </div>
            {layout.metadata_groups.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                No metadata groups defined for this entity.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Parent</th>
                    <th>Type</th>
                    <th>Metadata</th>
                    <th>Label</th>
                    <th>Rendering</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {layout.metadata_groups.map(g => (
                    <tr key={g.id}>
                      <td><code style={{ fontSize: 11, color: "var(--accent)" }}>{g.parent}</code></td>
                      <td><span className="chip chip-gray" style={{ fontSize: 10 }}>{g.field_type}</span></td>
                      <td><code style={{ fontSize: 11, color: "var(--accent)" }}>{g.metadata}</code></td>
                      <td style={{ fontSize: 12 }}>{g.label}</td>
                      <td>{g.rendering && <span className="chip chip-blue" style={{ fontSize: 10 }}>{g.rendering}</span>}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => setGroupModal({ open: true, group: g })}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                            onClick={() => deleteGroup(g)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {/* Modals */}
      {tabModal.open && (
        <TabModal
          entity={selectedEntity}
          tab={tabModal.tab}
          onClose={() => setTabModal({ open: false, tab: null })}
          onSaved={() => { setTabModal({ open: false, tab: null }); loadLayout(selectedEntity); notify("success", "Tab saved."); }}
        />
      )}
      {boxModal.open && (
        <BoxModal
          entity={selectedEntity}
          box={boxModal.box}
          onClose={() => setBoxModal({ open: false, box: null })}
          onSaved={() => { setBoxModal({ open: false, box: null }); loadLayout(selectedEntity); notify("success", "Box saved."); }}
        />
      )}
      {fieldModal.open && fieldModal.box && (
        <FieldModal
          box={fieldModal.box}
          field={fieldModal.field}
          onClose={() => setFieldModal({ open: false, box: null, field: null })}
          onSaved={() => { setFieldModal({ open: false, box: null, field: null }); loadLayout(selectedEntity); notify("success", "Field saved."); }}
        />
      )}
      {groupModal.open && (
        <MetadataGroupModal
          entity={selectedEntity}
          group={groupModal.group}
          onClose={() => setGroupModal({ open: false, group: null })}
          onSaved={() => { setGroupModal({ open: false, group: null }); loadLayout(selectedEntity); notify("success", groupModal.group ? "Group updated." : "Group added."); }}
        />
      )}
    </div>
  );
}
