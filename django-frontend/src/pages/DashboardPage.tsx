import { useEffect, useState } from "react";
import { api } from "../api/client";
import { LoadingBlock, PageHeader } from "../components/shared";
import { useAuth } from "../auth/AuthContext";

interface Stats {
  clusters: number;
  mappings: number;
  presets: number;
  forms: number;
  processes: number;
  layouts: number;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.clusters().catch(() => []),
      api.collectionMappings().catch(() => []),
      api.presets().catch(() => []),
      api.submissionForms().catch(() => []),
      api.submissionProcesses().catch(() => []),
      api.formLayouts().catch(() => []),
    ]).then(([clusters, mappings, presets, forms, processes, layouts]) => {
      setStats({
        clusters: clusters.length,
        mappings: mappings.length,
        presets: presets.length,
        forms: forms.length,
        processes: processes.length,
        layouts: layouts.length,
      });
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Config Cockpit"
        desc={`Welcome back, ${user?.first_name || user?.username}. All DSpace CRIS frontend configuration is managed here.`}
      />

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[
            { label: "Entity Clusters",      value: stats!.clusters,  sub: "Dashboard groupings" },
            { label: "Collection Mappings",   value: stats!.mappings,  sub: "Entity → collection rules" },
            { label: "Quicklink Presets",     value: stats!.presets,   sub: "Quicklinks tab presets" },
            { label: "Submission Forms",      value: stats!.forms,     sub: "Imported from XML" },
            { label: "Submission Processes",  value: stats!.processes, sub: "Imported from XML" },
            { label: "Form Layouts",          value: stats!.layouts,   sub: "Section & field overrides" },
          ].map((s) => (
            <div className="stat-card" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <div className="card-title">Architecture</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
            <p>
              This cockpit is the <strong>single source of truth</strong> for all
              runtime configuration. Changes are served immediately to the DSpace
              CRIS frontend via the REST API — no rebuild required.
            </p>
            <hr className="divider" />
            <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
              <li>
                <strong>Entity Clusters</strong> — control the dashboard groupings and which entity types appear in each.
              </li>
              <li>
                <strong>Collection Mappings</strong> — route entity types to specific DSpace collection UUIDs, with optional conditions.
              </li>
              <li>
                <strong>Quicklink Presets</strong> — define the preset tabs on the Quicklinks page, each with configurable facet filters.
              </li>
              <li>
                <strong>Form Layouts</strong> — override section order, field labels, and conditional visibility for submission forms.
              </li>
              <li>
                <strong>Submission Forms / Processes</strong> — read-only mirrors of the DSpace XML, imported via management command.
              </li>
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="card-title">API Endpoints</div>
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["/api/dspace-config/clusters/", "Entity clusters"],
                ["/api/dspace-config/collection-mappings/", "Collection rules"],
                ["/api/dspace-config/quicklinks/presets/", "Quicklink presets"],
                ["/api/dspace-config/submission-forms/", "Submission forms"],
                ["/api/dspace-config/form-layouts/", "Form layouts"],
                ["/api/dspace-config/site-settings/", "Feature flags"],
                ["/api/cockpit/auth/login/", "Cockpit login"],
              ].map(([path, desc]) => (
                <tr key={path}>
                  <td>
                    <code>{path}</code>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
