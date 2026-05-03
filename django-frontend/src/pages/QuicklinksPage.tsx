import { useCallback, useEffect, useState } from "react";
import { api, type QuickPreset, type PresetFilter } from "../api/client";
import {
  Alert,
  EmptyState,
  EnabledChip,
  FormGroup,
  LoadingBlock,
  Modal,
  ModalActions,
  PageHeader,
  Spinner,
  useNotice,
} from "../components/shared";

// ── Filter sub-panel ──────────────────────────────────────────────────────────

function FilterPanel({
  preset,
  onRefresh,
}: {
  preset: QuickPreset;
  onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editFilter, setEditFilter] = useState<PresetFilter | null>(null);
  const [form, setForm] = useState({
    key: "", label: "", facet_name: "", kind: "text", placeholder: "", sort_order: 0,
  });
  const [saving, setSaving] = useState(false);
  const { notice, notify } = useNotice();

  function set(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openAdd() {
    setForm({ key: "", label: "", facet_name: "", kind: "text", placeholder: "", sort_order: preset.filters.length });
    setEditFilter(null);
    setAddOpen(true);
  }

  function openEdit(f: PresetFilter) {
    setForm({ key: f.key, label: f.label, facet_name: f.facet_name, kind: f.kind, placeholder: f.placeholder, sort_order: f.sort_order });
    setEditFilter(f);
    setAddOpen(true);
  }

  async function saveFilter() {
    setSaving(true);
    try {
      if (editFilter) {
        await api.patchFilter(editFilter.id, form);
        notify("success", "Filter updated.");
      } else {
        await api.addFilter(preset.id, form);
        notify("success", "Filter added.");
      }
      setAddOpen(false);
      onRefresh();
    } catch (err: any) {
      notify("error", err?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFilter(f: PresetFilter) {
    if (!confirm(`Delete filter "${f.label}"?`)) return;
    try {
      await api.deleteFilter(f.id);
      onRefresh();
    } catch {
      notify("error", "Delete failed.");
    }
  }

  return (
    <div>
      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}
      {preset.filters.length > 0 ? (
        <table style={{ marginBottom: 10 }}>
          <thead>
            <tr>
              <th>Sort</th><th>Key</th><th>Label</th><th>Facet</th><th>Kind</th><th></th>
            </tr>
          </thead>
          <tbody>
            {preset.filters.map((f) => (
              <tr key={f.id}>
                <td style={{ color: "var(--muted)" }}>{f.sort_order}</td>
                <td><code>{f.key}</code></td>
                <td>{f.label}</td>
                <td><code>{f.facet_name}</code></td>
                <td><span className="chip chip-blue">{f.kind}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(f)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteFilter(f)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>No filters configured for this preset.</div>
      )}
      <button className="btn btn-sm btn-primary" onClick={openAdd}>+ Add Filter</button>

      {addOpen && (
        <Modal title={editFilter ? "Edit Filter" : "Add Filter"} onClose={() => setAddOpen(false)}>
          <div className="form-row">
            <FormGroup label="Key">
              <input type="text" value={form.key} onChange={(e) => set({ key: e.target.value })} placeholder="e.g. title" />
            </FormGroup>
            <FormGroup label="Sort Order">
              <input type="number" value={form.sort_order} onChange={(e) => set({ sort_order: +e.target.value })} />
            </FormGroup>
          </div>
          <FormGroup label="Label">
            <input type="text" value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Title" />
          </FormGroup>
          <FormGroup label="Facet Name" hint="The DSpace discovery facet field name">
            <input type="text" value={form.facet_name} onChange={(e) => set({ facet_name: e.target.value })} placeholder="e.g. dc.title" />
          </FormGroup>
          <div className="form-row">
            <FormGroup label="Kind">
              <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
                <option value="text">Text</option>
                <option value="date">Date</option>
              </select>
            </FormGroup>
            <FormGroup label="Placeholder">
              <input type="text" value={form.placeholder} onChange={(e) => set({ placeholder: e.target.value })} placeholder="e.g. Search by title…" />
            </FormGroup>
          </div>
          <ModalActions>
            <button className="btn" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={saveFilter} disabled={saving}>
              {saving ? <><Spinner white /> Saving…</> : "Save"}
            </button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}

// ── Preset form ───────────────────────────────────────────────────────────────

interface PresetForm {
  key: string;
  label: string;
  description: string;
  sort_order: number;
  enabled: boolean;
}

const EMPTY_PRESET: PresetForm = { key: "", label: "", description: "", sort_order: 0, enabled: true };

// ── Page ──────────────────────────────────────────────────────────────────────

export function QuicklinksPage() {
  const [presets, setPresets] = useState<QuickPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QuickPreset | null>(null);
  const [modal, setModal] = useState<{ open: boolean; preset: QuickPreset | null }>({ open: false, preset: null });
  const [form, setForm] = useState<PresetForm>(EMPTY_PRESET);
  const [saving, setSaving] = useState(false);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    try {
      const data = await api.presets();
      const sorted = [...data].sort((a, b) => a.sort_order - b.sort_order);
      setPresets(sorted);
      // Keep selected in sync
      if (selected) {
        const updated = sorted.find((p) => p.id === selected.id);
        setSelected(updated ?? null);
      }
    } catch {
      notify("error", "Failed to load presets.");
    } finally {
      setLoading(false);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function set(patch: Partial<PresetForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openNew() {
    setForm(EMPTY_PRESET);
    setModal({ open: true, preset: null });
  }

  function openEdit(p: QuickPreset) {
    setForm({ key: p.key, label: p.label, description: p.description, sort_order: p.sort_order, enabled: p.enabled });
    setModal({ open: true, preset: p });
  }

  function closeModal() {
    setModal({ open: false, preset: null });
  }

  async function save() {
    setSaving(true);
    try {
      if (modal.preset) {
        await api.patchPreset(modal.preset.id, form);
        notify("success", "Preset updated.");
      } else {
        await api.createPreset(form);
        notify("success", "Preset created.");
      }
      closeModal();
      load();
    } catch (err: any) {
      notify("error", err?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function del(p: QuickPreset) {
    if (!confirm(`Delete preset "${p.label}" and all its filters?`)) return;
    try {
      await api.deletePreset(p.id);
      if (selected?.id === p.id) setSelected(null);
      notify("success", "Preset deleted.");
      load();
    } catch {
      notify("error", "Delete failed.");
    }
  }

  const [exportingDiscovery, setExportingDiscovery] = useState(false);

  async function downloadDiscoveryXml() {
    setExportingDiscovery(true);
    try {
      const res = await fetch("/api/dspace-config/discovery-xml/", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "discovery.xml";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      notify("error", "Failed to export discovery.xml.");
    } finally {
      setExportingDiscovery(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quicklink Presets"
        desc="Configure the presets shown on the Quicklinks tab. Each preset can have multiple facet filters."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              onClick={downloadDiscoveryXml}
              disabled={exportingDiscovery}
              title="Download discovery.xml patched with all current quicklink facets"
            >
              {exportingDiscovery ? <><Spinner /> Exporting…</> : "⬇ discovery.xml"}
            </button>
            <button className="btn btn-primary" onClick={openNew}>+ New Preset</button>
          </div>
        }
      />

      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}

      <div className="two-col">
        {/* Left: preset list */}
        <div className="card">
          <div className="card-title">
            Presets{" "}
            <span className="count-badge">{presets.length}</span>
          </div>
          {loading ? (
            <LoadingBlock />
          ) : presets.length === 0 ? (
            <EmptyState msg="No presets yet. Create the first one." />
          ) : (
            presets.map((p) => (
              <div
                key={p.id}
                className={`preset-item${selected?.id === p.id ? " selected" : ""}`}
                onClick={() => setSelected(selected?.id === p.id ? null : p)}
              >
                <div className="preset-item-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label}</div>
                    <code style={{ fontSize: 11 }}>{p.key}</code>
                  </div>
                  <div className="preset-item-actions">
                    <EnabledChip enabled={p.enabled} />
                    <button
                      className="btn btn-sm"
                      onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => { e.stopPropagation(); del(p); }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {p.description && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    {p.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {p.filters.length} filter{p.filters.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: filter panel */}
        <div className="card">
          {selected ? (
            <>
              <div className="card-title">
                Filters — <code>{selected.key}</code>{" "}
                <span className="count-badge">{selected.filters.length}</span>
              </div>
              <FilterPanel preset={selected} onRefresh={load} />
            </>
          ) : (
            <EmptyState msg="← Select a preset to manage its filters" />
          )}
        </div>
      </div>

      {modal.open && (
        <Modal
          title={modal.preset ? "Edit Preset" : "New Quicklink Preset"}
          onClose={closeModal}
        >
          <div className="form-row">
            <FormGroup label="Key" hint="Unique slug, e.g. publications">
              <input type="text" value={form.key} onChange={(e) => set({ key: e.target.value })} placeholder="publications" />
            </FormGroup>
            <FormGroup label="Sort Order">
              <input type="number" value={form.sort_order} onChange={(e) => set({ sort_order: +e.target.value })} />
            </FormGroup>
          </div>
          <FormGroup label="Label">
            <input type="text" value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="Publications" />
          </FormGroup>
          <FormGroup label="Description (optional)">
            <input type="text" value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </FormGroup>
          <div className="form-group">
            <label className="toggle-control" style={{ gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Enabled</span>
            </label>
          </div>
          <ModalActions>
            <button className="btn" onClick={closeModal} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><Spinner white /> Saving…</> : "Save"}
            </button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
