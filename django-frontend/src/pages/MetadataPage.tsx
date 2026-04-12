import { useEffect, useRef, useState } from "react";
import { api, type MetadataSchema, type MetadataField } from "../api/client";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  ReadonlyBanner,
} from "../components/shared";
import { Spinner } from "../components/shared";

export function MetadataPage() {
  const [schemas, setSchemas] = useState<MetadataSchema[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.metadataSchemas().then((d) => {
      setSchemas(d);
      setSchemasLoading(false);
    }).catch(() => setSchemasLoading(false));
  }, []);

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const data = await api.metadataFields(q.trim());
      setFields(data);
    } catch {
      setFields([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Metadata Registry"
        desc="DSpace metadata schemas and fields — read-only. Used for field autocomplete in form layouts."
      />
      <ReadonlyBanner msg="Read-only — populated by the import_plain_config management command." />

      {/* Field search */}
      <div className="card">
        <div className="card-title">Field Lookup</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search fields, e.g. dc.title or contributor"
            style={{ maxWidth: 340 }}
          />
          <button className="btn btn-primary" onClick={search} disabled={searching || !q.trim()}>
            {searching ? <><Spinner white /> Searching…</> : "Search"}
          </button>
          {searched && (
            <button className="btn" onClick={() => { setQ(""); setFields([]); setSearched(false); }}>
              Clear
            </button>
          )}
        </div>
        {searching ? (
          <LoadingBlock label="Searching fields…" />
        ) : searched && fields.length === 0 ? (
          <EmptyState msg="No fields matched your query." />
        ) : fields.length > 0 ? (
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
              {fields.slice(0, 100).map((f) => (
                <tr key={f.id}>
                  <td><code>{f.field}</code></td>
                  <td><span className="chip chip-blue">{f.schema_name}</span></td>
                  <td>{f.element}</td>
                  <td>{f.qualifier || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.scope_note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Enter a field name or keyword above and press Search.
          </div>
        )}
      </div>

      {/* Schema list */}
      <div className="card">
        <div className="card-title">
          Schemas <span className="count-badge">{schemas.length}</span>
        </div>
        {schemasLoading ? (
          <LoadingBlock />
        ) : schemas.length === 0 ? (
          <EmptyState msg="No schemas imported yet. Run import_plain_config." />
        ) : (
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
              {schemas.map((s) => (
                <tr key={s.id}>
                  <td><span className="chip chip-blue">{s.name}</span></td>
                  <td><code style={{ fontSize: 11 }}>{s.namespace}</code></td>
                  <td>{s.field_count}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
