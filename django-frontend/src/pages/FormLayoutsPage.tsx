import { useCallback, useEffect, useState } from "react";
import { api, type FormLayout } from "../api/client";
import {
  Alert,
  EmptyState,
  FormGroup,
  LoadingBlock,
  Modal,
  ModalActions,
  PageHeader,
  Spinner,
  useNotice,
} from "../components/shared";

interface LayoutForm {
  form_name: string;
  profile: string;
  collection: string;
  label: string;
}

const EMPTY: LayoutForm = { form_name: "", profile: "plain", collection: "", label: "" };

function fromLayout(l: FormLayout): LayoutForm {
  return {
    form_name: l.form_name,
    profile: l.profile,
    collection: l.collection ?? "",
    label: l.label,
  };
}

export function FormLayoutsPage() {
  const [layouts, setLayouts] = useState<FormLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FormLayout | null>(null);
  const [modal, setModal] = useState<{ open: boolean; layout: FormLayout | null }>({ open: false, layout: null });
  const [form, setForm] = useState<LayoutForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    try {
      const data = await api.formLayouts();
      setLayouts(data);
      if (selected) {
        setSelected(data.find((l) => l.id === selected.id) ?? null);
      }
    } catch {
      notify("error", "Failed to load form layouts.");
    } finally {
      setLoading(false);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function set(patch: Partial<LayoutForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openNew() {
    setForm(EMPTY);
    setModal({ open: true, layout: null });
  }

  function openEdit(l: FormLayout) {
    setForm(fromLayout(l));
    setModal({ open: true, layout: l });
  }

  function closeModal() {
    setModal({ open: false, layout: null });
  }

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, collection: form.collection || null };
      if (modal.layout) {
        await api.patchLayout(modal.layout.id, body);
        notify("success", "Layout updated.");
      } else {
        await api.createLayout(body);
        notify("success", "Layout created.");
      }
      closeModal();
      load();
    } catch (err: any) {
      notify("error", err?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function del(l: FormLayout) {
    if (!confirm(`Delete layout "${l.form_name} / ${l.profile}"?`)) return;
    try {
      await api.deleteLayout(l.id);
      if (selected?.id === l.id) setSelected(null);
      notify("success", "Layout deleted.");
      load();
    } catch {
      notify("error", "Delete failed.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Form Layouts"
        desc="Override section order, field labels, hints, and conditional visibility per form / profile / collection combination."
        actions={<button className="btn btn-primary" onClick={openNew}>+ New Layout</button>}
      />

      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}

      <div className="two-col">
        {/* Layout list */}
        <div className="card">
          <div className="card-title">
            Layouts <span className="count-badge">{layouts.length}</span>
          </div>
          {loading ? (
            <LoadingBlock />
          ) : layouts.length === 0 ? (
            <EmptyState msg="No layouts yet. Create the first one." />
          ) : (
            layouts.map((l) => (
              <div
                key={l.id}
                className={`preset-item${selected?.id === l.id ? " selected" : ""}`}
                onClick={() => setSelected(selected?.id === l.id ? null : l)}
              >
                <div className="preset-item-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{l.form_name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                      <span className="chip chip-blue" style={{ marginRight: 4 }}>{l.profile}</span>
                      {l.collection ? (
                        <code>{l.collection.slice(0, 8)}…</code>
                      ) : (
                        <span>all collections</span>
                      )}
                    </div>
                  </div>
                  <div className="preset-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => openEdit(l)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(l)}>Delete</button>
                  </div>
                </div>
                {l.label && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{l.label}</div>
                )}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {l.sections.length} section{l.sections.length !== 1 ? "s" : ""} ·{" "}
                  {l.conditional_blocks.length} conditional{l.conditional_blocks.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="card">
          {!selected ? (
            <EmptyState msg="← Select a layout to inspect its sections" />
          ) : (
            <>
              <div className="card-title">
                {selected.form_name} / <span className="chip chip-blue">{selected.profile}</span>
              </div>

              {/* Sections */}
              {selected.sections.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Sections</div>
                  <table style={{ marginBottom: 16 }}>
                    <thead>
                      <tr><th>Sort</th><th>Key</th><th>Label</th><th>Fields</th><th>Collapsed</th></tr>
                    </thead>
                    <tbody>
                      {selected.sections.map((s) => (
                        <tr key={s.id}>
                          <td style={{ color: "var(--muted)" }}>{s.sort_order}</td>
                          <td><code>{s.key}</code></td>
                          <td>{s.label}</td>
                          <td>{s.field_overrides.length}</td>
                          <td>{s.collapsed_by_default ? <span className="chip chip-gray">yes</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>No sections defined.</div>
              )}

              {/* Conditional blocks */}
              {selected.conditional_blocks.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Conditional Blocks</div>
                  <table>
                    <thead>
                      <tr><th>Sort</th><th>Trigger Field</th><th>Value</th><th>Reveals</th></tr>
                    </thead>
                    <tbody>
                      {selected.conditional_blocks.map((b) => (
                        <tr key={b.id}>
                          <td style={{ color: "var(--muted)" }}>{b.sort_order}</td>
                          <td><code>{b.trigger_field}</code></td>
                          <td><span className="chip chip-amber">{b.trigger_value}</span></td>
                          <td>
                            {b.revealed_section && <span className="chip chip-blue" style={{ marginRight: 3 }}>§ {b.revealed_section}</span>}
                            {b.revealed_fields.map((f) => <code key={f} style={{ marginRight: 3 }}>{f}</code>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
                Updated: {new Date(selected.updated_at).toLocaleString()}
              </div>
            </>
          )}
        </div>
      </div>

      {modal.open && (
        <Modal
          title={modal.layout ? "Edit Form Layout" : "New Form Layout"}
          onClose={closeModal}
        >
          <FormGroup label="Form Name" hint="Must match the name attribute in submission-forms.xml">
            <input
              type="text"
              value={form.form_name}
              onChange={(e) => set({ form_name: e.target.value })}
              placeholder="e.g. traditionalpageone"
            />
          </FormGroup>
          <div className="form-row">
            <FormGroup label="Profile" hint="e.g. plain, mdw">
              <input
                type="text"
                value={form.profile}
                onChange={(e) => set({ profile: e.target.value })}
                placeholder="plain"
              />
            </FormGroup>
            <FormGroup label="Collection UUID (optional)" hint="Leave blank to apply to all collections">
              <input
                type="text"
                value={form.collection}
                onChange={(e) => set({ collection: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </FormGroup>
          </div>
          <FormGroup label="Label (optional)" hint="Human-readable description of this layout">
            <input
              type="text"
              value={form.label}
              onChange={(e) => set({ label: e.target.value })}
            />
          </FormGroup>
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
