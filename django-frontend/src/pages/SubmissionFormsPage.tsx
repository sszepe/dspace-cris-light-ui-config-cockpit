import { useEffect, useState } from "react";
import { api, type SubmissionFormList, type SubmissionFormDetail } from "../api/client";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  ReadonlyBanner,
} from "../components/shared";

interface Props {
  /** When set, the form with this name is automatically selected on mount.
   *  Used when navigating here from a submission-form step link. */
  initialFormName?: string;
}

export function SubmissionFormsPage({ initialFormName }: Props) {
  const [forms, setForms] = useState<SubmissionFormList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubmissionFormList | null>(null);
  const [detail, setDetail] = useState<SubmissionFormDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.submissionForms().then((d) => {
      setForms(d);
      setLoading(false);
      // Auto-select if a form name was passed in (navigation from processes page)
      if (initialFormName) {
        const match = d.find((f) => f.name === initialFormName);
        if (match) selectForm(match);
      }
    }).catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectForm(f: SubmissionFormList) {
    setSelected(f);
    setDetail(null);
    setDetailLoading(true);
    api.submissionForm(f.id).then((d) => {
      setDetail(d);
      setDetailLoading(false);
    }).catch(() => setDetailLoading(false));
  }

  return (
    <div>
      <PageHeader
        title="Submission Forms"
        desc="Imported from DSpace submission-forms.xml. Use Form Layouts to apply section and field overrides."
      />
      <ReadonlyBanner />

      <div className="two-col">
        {/* Form list */}
        <div className="card">
          <div className="card-title">
            Forms <span className="count-badge">{forms.length}</span>
          </div>
          {loading ? (
            <LoadingBlock />
          ) : forms.length === 0 ? (
            <EmptyState msg="No forms imported yet. Run import_plain_config." />
          ) : (
            forms.map((f) => (
              <div
                key={f.id}
                className={`preset-item${selected?.id === f.id ? " selected" : ""}`}
                onClick={() => selectForm(f)}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {f.field_count} fields
                  {f.contains_required && (
                    <span className="chip chip-amber" style={{ marginLeft: 6 }}>
                      has required
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Field inspector */}
        <div className="card">
          {!selected ? (
            <EmptyState msg="← Select a form to inspect its fields" />
          ) : detailLoading ? (
            <LoadingBlock label={`Loading ${selected.name}…`} />
          ) : (
            <>
              <div className="card-title">
                {selected.name}{" "}
                <span className="count-badge">{detail?.fields.length ?? 0} fields</span>
              </div>
              {detail?.fields.length === 0 ? (
                <EmptyState msg="This form has no fields." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Col</th>
                      <th>Field</th>
                      <th>Label</th>
                      <th>Type</th>
                      <th>Req</th>
                      <th>Rep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.fields.map((f) => (
                      <tr key={f.id}>
                        <td style={{ color: "var(--muted)" }}>{f.row}</td>
                        <td style={{ color: "var(--muted)" }}>{f.col}</td>
                        <td>
                          <code>{f.field || "—"}</code>
                        </td>
                        <td>{f.label}</td>
                        <td>
                          <span className="chip chip-blue">{f.input_type}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {f.is_required ? (
                            <span className="chip chip-red">✓</span>
                          ) : null}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {f.repeatable ? (
                            <span className="chip chip-gray">rep</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
