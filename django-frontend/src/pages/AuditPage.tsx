import { useEffect, useState } from "react";
import { api } from "../api/client";
import { LoadingBlock, PageHeader } from "../components/shared";
import { Spinner } from "../components/shared";

export function AuditPage() {
  const [summary, setSummary] = useState<unknown>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [fieldUsage, setFieldUsage] = useState<unknown>(null);
  const [fuLoading, setFuLoading] = useState(false);
  const [fuLoaded, setFuLoaded] = useState(false);

  useEffect(() => {
    api.auditFormsSummary()
      .then((d) => setSummary(d))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  }, []);

  async function loadFieldUsage() {
    setFuLoading(true);
    try {
      const d = await api.auditFieldUsage();
      setFieldUsage(d);
      setFuLoaded(true);
    } catch {
      setFieldUsage(null);
      setFuLoaded(true);
    } finally {
      setFuLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Audit"
        desc="Reporting endpoints for form structure and field usage across submission forms."
      />

      <div className="card">
        <div className="card-title">Forms Summary</div>
        {summaryLoading ? (
          <LoadingBlock label="Loading forms summary…" />
        ) : summary === null ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            No data available. Ensure <code>import_plain_config</code> has been run to populate submission forms.
          </div>
        ) : (
          <pre
            style={{
              fontSize: 12,
              background: "#f8fafd",
              padding: 14,
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 400,
              border: "1px solid var(--border)",
              lineHeight: 1.6,
            }}
          >
            {JSON.stringify(summary, null, 2)}
          </pre>
        )}
      </div>

      <div className="card">
        <div className="card-title">Field Usage</div>
        {!fuLoaded ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              This report shows which metadata fields are used across all submission forms.
            </div>
            <button className="btn btn-primary" onClick={loadFieldUsage} disabled={fuLoading}>
              {fuLoading ? <><Spinner white /> Loading…</> : "Load Report"}
            </button>
          </div>
        ) : fieldUsage === null ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Failed to load field usage report.</div>
        ) : (
          <pre
            style={{
              fontSize: 12,
              background: "#f8fafd",
              padding: 14,
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 500,
              border: "1px solid var(--border)",
              lineHeight: 1.6,
            }}
          >
            {JSON.stringify(fieldUsage, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
