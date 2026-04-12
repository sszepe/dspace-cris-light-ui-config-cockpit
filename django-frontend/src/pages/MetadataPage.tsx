import { useEffect, useRef, useState, useCallback } from "react";
import {
  api,
  type MetadataSchema,
  type MetadataSchemaDetail,
  type MetadataField,
} from "../api/client";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  ReadonlyBanner,
  Spinner,
} from "../components/shared";

// ── Field table (shared between search results and schema drill-down) ─────────

function FieldTable({
  fields,
  onFilterBySchema,
}: {
  fields: MetadataField[];
  onFilterBySchema?: (schemaName: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Schema</th>
          <th>Element</th>
          <th>Qualifier</th>
          <th>Scope Note</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.id}>
            <td>
              <code style={{ fontSize: 11 }}>{f.field}</code>
            </td>
            <td>
              {onFilterBySchema ? (
                <button
                  onClick={() => onFilterBySchema(f.schema_name)}
                  style={{
                    background: "none", border: "none", padding: 0,
                    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                  title={`View all ${f.schema_name} fields`}
                >
                  <span className="chip chip-blue" style={{ fontSize: 10 }}>{f.schema_name}</span>
                  <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.6 }}>↗</span>
                </button>
              ) : (
                <span className="chip chip-blue" style={{ fontSize: 10 }}>{f.schema_name}</span>
              )}
            </td>
            <td style={{ fontSize: 12 }}>{f.element}</td>
            <td style={{ fontSize: 12, color: f.qualifier ? undefined : "var(--muted)" }}>
              {f.qualifier || "—"}
            </td>
            <td style={{
              fontSize: 11, color: "var(--muted)",
              maxWidth: 280, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {f.scope_note || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Schema row with expand/collapse ──────────────────────────────────────────

function SchemaRow({
  schema,
  expanded,
  onToggle,
}: {
  schema: MetadataSchema;
  expanded: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <tr
      onClick={() => onToggle(schema.id)}
      style={{ cursor: "pointer" }}
    >
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 4,
            background: expanded ? "var(--accent)" : "#e2e8f0",
            color: expanded ? "#fff" : "var(--muted)",
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            transition: "background 0.15s",
          }}>
            {expanded ? "▾" : "▸"}
          </span>
          <span className="chip chip-blue" style={{ fontSize: 11 }}>{schema.name}</span>
        </div>
      </td>
      <td>
        <code style={{ fontSize: 10, color: "var(--muted)" }}>{schema.namespace || "—"}</code>
      </td>
      <td style={{ fontSize: 12 }}>{schema.field_count}</td>
      <td style={{ fontSize: 11, color: "var(--muted)" }}>{schema.source || "—"}</td>
    </tr>
  );
}

// ── Schema drill-down row (fields for one schema) ─────────────────────────────

function SchemaFieldsRow({
  schema,
  onSearch,
}: {
  schema: MetadataSchema;
  onSearch: (q: string) => void;
}) {
  const [detail, setDetail] = useState<MetadataSchemaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api.metadataSchema(schema.id)
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [schema.id]);

  return (
    <tr>
      <td colSpan={4} style={{ padding: 0, background: "#f8fafc" }}>
        <div style={{
          borderTop: "2px solid var(--accent)",
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 16px",
        }}>
          {/* Header bar */}
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>
                {schema.name}
              </span>
              {schema.namespace && (
                <code style={{ fontSize: 10, color: "var(--muted)" }}>{schema.namespace}</code>
              )}
              {detail && (
                <span className="count-badge">{detail.fields.length} fields</span>
              )}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => onSearch(schema.name)}
              title="Search for this schema in the field lookup"
              style={{ fontSize: 11 }}
            >
              🔍 Search in lookup
            </button>
          </div>

          {loading ? (
            <LoadingBlock label={`Loading ${schema.name} fields…`} />
          ) : error ? (
            <div style={{ color: "var(--danger)", fontSize: 13, padding: "8px 0" }}>
              Failed to load fields.
            </div>
          ) : detail && detail.fields.length === 0 ? (
            <EmptyState msg="No fields defined for this schema." />
          ) : detail ? (
            <div style={{ maxHeight: 320, overflowY: "auto", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 11 }}>Field</th>
                    <th style={{ fontSize: 11 }}>Element</th>
                    <th style={{ fontSize: 11 }}>Qualifier</th>
                    <th style={{ fontSize: 11 }}>Scope Note</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.fields.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <code style={{ fontSize: 11 }}>{f.field}</code>
                      </td>
                      <td style={{ fontSize: 11 }}>{f.element}</td>
                      <td style={{ fontSize: 11, color: f.qualifier ? undefined : "var(--muted)" }}>
                        {f.qualifier || "—"}
                      </td>
                      <td style={{
                        fontSize: 10, color: "var(--muted)",
                        maxWidth: 320, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {f.scope_note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function MetadataPage() {
  // Schema state
  const [schemas, setSchemas] = useState<MetadataSchema[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [expandedSchemaId, setExpandedSchemaId] = useState<number | null>(null);
  const [schemaFilter, setSchemaFilter] = useState("");

  // Global field search state
  const [q, setQ] = useState("");
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Active view: "schemas" | "search"
  const [view, setView] = useState<"schemas" | "search">("schemas");

  useEffect(() => {
    api.metadataSchemas().then((d) => {
      setSchemas(d);
      setSchemasLoading(false);
    }).catch(() => setSchemasLoading(false));
  }, []);

  const search = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setQ(trimmed);
    setSearching(true);
    setSearched(true);
    setView("search");
    try {
      const data = await api.metadataFields(trimmed);
      setFields(data);
      setResultCount(data.length);
    } catch {
      setFields([]);
      setResultCount(0);
    } finally {
      setSearching(false);
    }
  }, []);

  function clearSearch() {
    setQ("");
    setFields([]);
    setSearched(false);
    setView("schemas");
  }

  function handleToggleSchema(id: number) {
    setExpandedSchemaId(prev => prev === id ? null : id);
  }

  // When a field table's schema chip is clicked → jump to schema drill-down
  function handleFilterBySchema(schemaName: string) {
    const schema = schemas.find(s => s.name === schemaName);
    if (!schema) return;
    setView("schemas");
    setExpandedSchemaId(schema.id);
    setSchemaFilter("");
    // scroll to schemas section after a tick
    setTimeout(() => {
      document.getElementById("schemas-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const filteredSchemas = schemaFilter.trim()
    ? schemas.filter(s =>
        s.name.toLowerCase().includes(schemaFilter.toLowerCase()) ||
        s.source.toLowerCase().includes(schemaFilter.toLowerCase())
      )
    : schemas;

  const totalFields = schemas.reduce((sum, s) => sum + s.field_count, 0);

  return (
    <div>
      <PageHeader
        title="Metadata Registry"
        desc="DSpace metadata schemas and fields — read-only. Used for field autocomplete in form layouts and CRIS layout editing."
      />
      <ReadonlyBanner msg="Read-only — populated by the import_plain_config management command." />

      {/* Stats bar */}
      {!schemasLoading && schemas.length > 0 && (
        <div style={{
          display: "flex", gap: 20, marginBottom: 16,
          padding: "10px 16px", background: "#f0f4f9",
          borderRadius: 10, fontSize: 13,
        }}>
          <span>
            <strong style={{ color: "var(--accent)" }}>{schemas.length}</strong>{" "}
            <span style={{ color: "var(--muted)" }}>schemas</span>
          </span>
          <span style={{ color: "#e2e8f0" }}>|</span>
          <span>
            <strong style={{ color: "var(--accent)" }}>{totalFields.toLocaleString()}</strong>{" "}
            <span style={{ color: "var(--muted)" }}>fields total</span>
          </span>
          {searched && resultCount > 0 && (
            <>
              <span style={{ color: "#e2e8f0" }}>|</span>
              <span>
                <strong style={{ color: "var(--accent)" }}>{resultCount}</strong>{" "}
                <span style={{ color: "var(--muted)" }}>search results for "{q}"</span>
                <button
                  onClick={clearSearch}
                  style={{
                    marginLeft: 8, fontSize: 11, color: "var(--muted)",
                    background: "none", border: "none", cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  clear
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {/* View switcher tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
        {(["schemas", "search"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "7px 18px", fontSize: 13, fontWeight: 600,
              borderRadius: v === "schemas" ? "8px 0 0 8px" : "0 8px 8px 0",
              border: "1px solid",
              borderColor: view === v ? "var(--accent)" : "#e2e8f0",
              background: view === v ? "var(--accent)" : "#fff",
              color: view === v ? "#fff" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {v === "schemas" ? `📋 Schemas (${schemas.length})` : `🔍 Field Search`}
          </button>
        ))}
      </div>

      {/* ── FIELD SEARCH VIEW ─────────────────────────────────────────────── */}
      {view === "search" && (
        <div className="card">
          <div className="card-title">Field Lookup</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(q)}
              placeholder="Search fields — e.g. dc.title, contributor, orcid"
              style={{ flex: 1, maxWidth: 420 }}
              autoFocus
            />
            <button
              className="btn btn-primary"
              onClick={() => search(q)}
              disabled={searching || !q.trim()}
            >
              {searching ? <><Spinner white /> Searching…</> : "Search"}
            </button>
            {searched && (
              <button className="btn" onClick={clearSearch}>
                Clear
              </button>
            )}
          </div>

          {searching ? (
            <LoadingBlock label="Searching fields…" />
          ) : searched && fields.length === 0 ? (
            <EmptyState msg={`No fields matched "${q}".`} />
          ) : fields.length > 0 ? (
            <>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                {fields.length} result{fields.length !== 1 ? "s" : ""}{" "}
                {fields.length === 100 && "— showing first 100, refine your query for more"}
              </div>
              <FieldTable fields={fields} onFilterBySchema={handleFilterBySchema} />
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>
              Enter a field name or keyword and press Search, or press Enter.
            </div>
          )}
        </div>
      )}

      {/* ── SCHEMAS VIEW ──────────────────────────────────────────────────── */}
      {view === "schemas" && (
        <div id="schemas-section" className="card">
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 14,
          }}>
            <div className="card-title" style={{ margin: 0 }}>
              Schemas <span className="count-badge">{filteredSchemas.length}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={schemaFilter}
                onChange={e => {
                  setSchemaFilter(e.target.value);
                  setExpandedSchemaId(null);
                }}
                placeholder="Filter schemas…"
                style={{ fontSize: 12, padding: "5px 10px", width: 160 }}
              />
              {schemaFilter && (
                <button
                  className="btn btn-sm"
                  onClick={() => setSchemaFilter("")}
                  style={{ fontSize: 11 }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {schemasLoading ? (
            <LoadingBlock />
          ) : filteredSchemas.length === 0 ? (
            <EmptyState msg={schemaFilter ? `No schemas match "${schemaFilter}".` : "No schemas imported yet. Run import_plain_config."} />
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
              Click a schema row to expand and browse its fields.
            </div>
          )}

          {!schemasLoading && filteredSchemas.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Namespace</th>
                  <th>Fields</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchemas.map((s) => (
                  <>
                    <SchemaRow
                      key={`row-${s.id}`}
                      schema={s}
                      expanded={expandedSchemaId === s.id}
                      onToggle={handleToggleSchema}
                    />
                    {expandedSchemaId === s.id && (
                      <SchemaFieldsRow
                        key={`fields-${s.id}`}
                        schema={s}
                        onSearch={(name) => { search(name); }}
                      />
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
