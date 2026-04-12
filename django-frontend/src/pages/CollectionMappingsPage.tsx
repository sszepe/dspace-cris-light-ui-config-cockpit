import { useCallback, useEffect, useState } from "react";
import { api, type CollectionMapping } from "../api/client";
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

interface MappingForm {
  entity_type: string;
  collection_id: string;
  label: string;
  sort_order: number;
  dc_type_includes: string; // comma-separated
  risfunding_status_in: string; // comma-separated
}

const EMPTY: MappingForm = {
  entity_type: "",
  collection_id: "",
  label: "",
  sort_order: 0,
  dc_type_includes: "",
  risfunding_status_in: "",
};

function fromMapping(m: CollectionMapping): MappingForm {
  return {
    entity_type: m.entity_type,
    collection_id: m.collection_id,
    label: m.label,
    sort_order: m.sort_order,
    dc_type_includes: (m.conditions?.dcTypeIncludes ?? []).join(", "),
    risfunding_status_in: (m.conditions?.risfundingStatusIn ?? []).join(", "),
  };
}

function toBody(f: MappingForm) {
  const dcTypes = f.dc_type_includes
    ? f.dc_type_includes.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const statuses = f.risfunding_status_in
    ? f.risfunding_status_in.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    entity_type: f.entity_type,
    collection_id: f.collection_id,
    label: f.label,
    sort_order: f.sort_order,
    dc_type_includes: dcTypes,
    risfunding_status_in: statuses,
  };
}

export function CollectionMappingsPage() {
  const [rows, setRows] = useState<CollectionMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; mapping: CollectionMapping | null }>({
    open: false,
    mapping: null,
  });
  const [form, setForm] = useState<MappingForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    try {
      const data = await api.collectionMappings();
      setRows([...data].sort((a, b) => a.sort_order - b.sort_order));
    } catch {
      notify("error", "Failed to load collection mappings.");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function set(patch: Partial<MappingForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function openNew() {
    setForm(EMPTY);
    setModal({ open: true, mapping: null });
  }

  function openEdit(m: CollectionMapping) {
    setForm(fromMapping(m));
    setModal({ open: true, mapping: m });
  }

  function closeModal() {
    setModal({ open: false, mapping: null });
  }

  async function save() {
    setSaving(true);
    try {
      if (modal.mapping) {
        await api.patchMapping(modal.mapping.id, toBody(form));
        notify("success", "Mapping updated.");
      } else {
        await api.createMapping(toBody(form));
        notify("success", "Mapping created.");
      }
      closeModal();
      load();
    } catch (err: any) {
      notify("error", err?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function del(m: CollectionMapping) {
    if (!confirm(`Delete mapping for "${m.entity_type}"?`)) return;
    try {
      await api.deleteMapping(m.id);
      notify("success", "Mapping deleted.");
      load();
    } catch {
      notify("error", "Delete failed.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Collection Mappings"
        desc="Rules that map entity types to DSpace collection UUIDs. Conditions narrow which items match a rule."
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            + New Mapping
          </button>
        }
      />

      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState msg="No collection mappings yet." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Sort</th>
                <th>Entity Type</th>
                <th>Collection UUID</th>
                <th>Label</th>
                <th>Conditions</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: "var(--muted)" }}>{r.sort_order}</td>
                  <td>
                    <span className="chip chip-blue">{r.entity_type}</span>
                  </td>
                  <td>
                    <code title={r.collection_id}>{r.collection_id.slice(0, 8)}…</code>
                  </td>
                  <td>{r.label}</td>
                  <td>
                    {r.conditions ? (
                      <div style={{ fontSize: 12 }}>
                        {r.conditions.dcTypeIncludes?.length ? (
                          <div>
                            <span style={{ color: "var(--muted)" }}>dc.type: </span>
                            {r.conditions.dcTypeIncludes.map((v) => (
                              <span key={v} className="chip chip-amber" style={{ marginRight: 3 }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {r.conditions.risfundingStatusIn?.length ? (
                          <div>
                            <span style={{ color: "var(--muted)" }}>status: </span>
                            {r.conditions.risfundingStatusIn.map((v) => (
                              <span key={v} className="chip chip-amber" style={{ marginRight: 3 }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="chip chip-green">always</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-sm" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => del(r)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal.open && (
        <Modal
          title={modal.mapping ? "Edit Collection Mapping" : "New Collection Mapping"}
          onClose={closeModal}
        >
          <div className="form-row">
            <FormGroup label="Entity Type" hint="e.g. Publication, Funding">
              <input
                type="text"
                value={form.entity_type}
                onChange={(e) => set({ entity_type: e.target.value })}
                placeholder="Publication"
              />
            </FormGroup>
            <FormGroup label="Sort Order">
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => set({ sort_order: +e.target.value })}
              />
            </FormGroup>
          </div>
          <FormGroup label="Collection UUID" hint="Full UUID of the DSpace collection">
            <input
              type="text"
              value={form.collection_id}
              onChange={(e) => set({ collection_id: e.target.value })}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </FormGroup>
          <FormGroup label="Label" hint="Human-readable name for this mapping">
            <input
              type="text"
              value={form.label}
              onChange={(e) => set({ label: e.target.value })}
            />
          </FormGroup>
          <hr className="divider" />
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--muted)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Conditions (optional — leave blank to match all items)
          </div>
          <FormGroup
            label="dc.type includes (comma-separated)"
            hint='e.g. Grant, Scholarship — matches items where dc.type contains any of these values'
          >
            <input
              type="text"
              value={form.dc_type_includes}
              onChange={(e) => set({ dc_type_includes: e.target.value })}
              placeholder="Grant, Scholarship"
            />
          </FormGroup>
          <FormGroup
            label="risfunding status in (comma-separated)"
            hint='e.g. approved — matches items with exactly these risfunding status values'
          >
            <input
              type="text"
              value={form.risfunding_status_in}
              onChange={(e) => set({ risfunding_status_in: e.target.value })}
              placeholder="approved"
            />
          </FormGroup>
          <ModalActions>
            <button className="btn" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><Spinner white /> Saving…</> : "Save"}
            </button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
