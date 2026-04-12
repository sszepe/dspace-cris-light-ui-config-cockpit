import React, { useCallback, useEffect, useState } from "react";
import { api, type Cluster, type EntityTypeEntry } from "../api/client";
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

// ── Entity-type inline editor ─────────────────────────────────────────────────

function EntityTypeList({
  cluster,
  onRefresh,
}: {
  cluster: Cluster;
  onRefresh: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const { notice, notify } = useNotice();

  async function addType() {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      await api.addEntityType(cluster.id, {
        entity_type_label: newLabel.trim(),
        sort_order: cluster.entity_types.length,
      });
      setNewLabel("");
      onRefresh();
    } catch {
      notify("error", "Failed to add entity type.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteType(et: EntityTypeEntry) {
    if (!confirm(`Remove "${et.entity_type_label}" from this cluster?`)) return;
    setBusy(et.id);
    try {
      await api.deleteEntityType(et.id);
      onRefresh();
    } catch {
      notify("error", "Failed to remove entity type.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {cluster.entity_types.map((et) => (
          <span
            key={et.id}
            className="chip chip-blue"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {et.entity_type_label}
            <button
              onClick={() => deleteType(et)}
              disabled={busy === et.id}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
                fontSize: 11,
                color: "var(--accent)",
                opacity: busy === et.id ? 0.4 : 0.7,
              }}
              aria-label={`Remove ${et.entity_type_label}`}
            >
              ✕
            </button>
          </span>
        ))}
        {cluster.entity_types.length === 0 && (
          <span style={{ color: "var(--muted)", fontSize: 12 }}>No entity types yet.</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addType()}
          placeholder="e.g. Publication"
          style={{ maxWidth: 220 }}
          disabled={adding}
        />
        <button className="btn btn-sm btn-primary" onClick={addType} disabled={adding || !newLabel.trim()}>
          {adding ? <Spinner white /> : "+ Add"}
        </button>
      </div>
    </div>
  );
}

// ── Cluster modal ─────────────────────────────────────────────────────────────

interface ClusterForm {
  key: string;
  label: string;
  description: string;
  sort_order: number;
  enabled: boolean;
}

const EMPTY_FORM: ClusterForm = {
  key: "",
  label: "",
  description: "",
  sort_order: 0,
  enabled: true,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [modal, setModal] = useState<{ open: boolean; cluster: Cluster | null }>({
    open: false,
    cluster: null,
  });
  const [form, setForm] = useState<ClusterForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    try {
      const data = await api.clusters();
      setClusters([...data].sort((a, b) => a.sort_order - b.sort_order));
    } catch {
      notify("error", "Failed to load clusters.");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setForm(EMPTY_FORM);
    setModal({ open: true, cluster: null });
  }

  function openEdit(c: Cluster) {
    setForm({
      key: c.key,
      label: c.label,
      description: c.description,
      sort_order: c.sort_order,
      enabled: c.enabled,
    });
    setModal({ open: true, cluster: c });
  }

  function closeModal() {
    setModal({ open: false, cluster: null });
  }

  async function save() {
    setSaving(true);
    try {
      if (modal.cluster) {
        await api.patchCluster(modal.cluster.id, form);
        notify("success", "Cluster updated.");
      } else {
        await api.createCluster(form);
        notify("success", "Cluster created.");
      }
      closeModal();
      load();
    } catch (err: any) {
      notify("error", err?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCluster(c: Cluster) {
    if (!confirm(`Delete cluster "${c.label}"? This will also remove all its entity types.`)) return;
    try {
      await api.deleteCluster(c.id);
      notify("success", `Cluster "${c.label}" deleted.`);
      load();
    } catch {
      notify("error", "Delete failed.");
    }
  }

  function set(patch: Partial<ClusterForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  return (
    <div>
      <PageHeader
        title="Entity Clusters"
        desc="Dashboard groupings — each cluster holds one or more entity type labels. Enabled clusters appear on the dashboard."
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            + New Cluster
          </button>
        }
      />

      {notice && <Alert type={notice.type}>{notice.msg}</Alert>}

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : clusters.length === 0 ? (
          <EmptyState msg="No clusters yet. Create the first one." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Sort</th>
                <th>Key</th>
                <th>Label</th>
                <th>Entity Types</th>
                <th>Status</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <React.Fragment key={c.id}>
                  <tr>
                    <td style={{ color: "var(--muted)" }}>{c.sort_order}</td>
                    <td>
                      <code>{c.key}</code>
                    </td>
                    <td>
                      <strong>{c.label}</strong>
                      {c.description && (
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {c.entity_types.map((et) => (
                          <span key={et.id} className="chip chip-blue">
                            {et.entity_type_label}
                          </span>
                        ))}
                        {c.entity_types.length === 0 && (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>
                            none
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <EnabledChip enabled={c.enabled} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            setExpanded(expanded === c.id ? null : c.id)
                          }
                        >
                          {expanded === c.id ? "▲ Types" : "▼ Types"}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => deleteCluster(c)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={6} style={{ background: "#f8fafd", padding: "12px 20px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
                          ENTITY TYPES — {c.label}
                        </div>
                        <EntityTypeList cluster={c} onRefresh={load} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal.open && (
        <Modal
          title={modal.cluster ? "Edit Cluster" : "New Cluster"}
          onClose={closeModal}
        >
          <div className="form-row">
            <FormGroup label="Key" hint="Unique identifier, e.g. publications">
              <input
                type="text"
                value={form.key}
                onChange={(e) => set({ key: e.target.value })}
                placeholder="publications"
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
          <FormGroup label="Label">
            <input
              type="text"
              value={form.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="Display label shown on the dashboard"
            />
          </FormGroup>
          <FormGroup label="Description (optional)">
            <input
              type="text"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </FormGroup>
          <div className="form-group">
            <label className="toggle-control" style={{ gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set({ enabled: e.target.checked })}
              />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Enabled</span>
            </label>
          </div>
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
