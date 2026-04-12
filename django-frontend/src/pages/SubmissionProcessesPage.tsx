import { useEffect, useState } from "react";
import { api, type SubmissionProcessList, type SubmissionProcess } from "../api/client";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  ReadonlyBanner,
} from "../components/shared";

interface Props {
  /** Called when the user clicks a submission-form link — navigates to the
   *  Submission Forms page and pre-selects the form with this name. */
  onNavigateToForm?: (formName: string) => void;
}

export function SubmissionProcessesPage({ onNavigateToForm }: Props) {
  const [processes, setProcesses] = useState<SubmissionProcessList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubmissionProcessList | null>(null);
  const [detail, setDetail] = useState<SubmissionProcess | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.submissionProcesses().then((d) => {
      setProcesses(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function select(p: SubmissionProcessList) {
    setSelected(p);
    setDetail(null);
    setDetailLoading(true);
    api.submissionProcess(p.id).then((d) => {
      setDetail(d);
      setDetailLoading(false);
    }).catch(() => setDetailLoading(false));
  }

  return (
    <div>
      <PageHeader
        title="Submission Processes"
        desc="Imported from DSpace item-submission.xml. Shows which steps are included in each submission workflow."
      />
      <ReadonlyBanner />

      <div className="two-col">
        <div className="card">
          <div className="card-title">
            Processes <span className="count-badge">{processes.length}</span>
          </div>
          {loading ? (
            <LoadingBlock />
          ) : processes.length === 0 ? (
            <EmptyState msg="No processes imported yet. Run import_plain_config." />
          ) : (
            processes.map((p) => (
              <div
                key={p.id}
                className={`preset-item${selected?.id === p.id ? " selected" : ""}`}
                onClick={() => select(p)}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {p.step_count} step{p.step_count !== 1 ? "s" : ""}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          {!selected ? (
            <EmptyState msg="← Select a process to see its steps" />
          ) : detailLoading ? (
            <LoadingBlock />
          ) : (
            <>
              <div className="card-title">
                {selected.name}{" "}
                <span className="count-badge">{detail?.steps.length ?? 0} steps</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Step ID</th>
                    <th>Heading</th>
                    <th>Type</th>
                    <th>Mandatory</th>
                  </tr>
                </thead>
                <tbody>
                  {detail?.steps.map((s) => {
                    // submission-form steps: step_id == the form name
                    const isFormStep = s.type === "submission-form";

                    return (
                      <tr key={s.id}>
                        <td style={{ color: "var(--muted)" }}>{s.sort_order}</td>
                        <td>
                          {isFormStep && onNavigateToForm ? (
                            <button
                              onClick={() => onNavigateToForm(s.step_id)}
                              title={`Open form "${s.step_id}" in Submission Forms`}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <code style={{
                                fontSize: 11,
                                color: "var(--accent)",
                                textDecoration: "underline",
                                textDecorationStyle: "dotted",
                              }}>
                                {s.step_id}
                              </code>
                              <span style={{ fontSize: 10, color: "var(--accent)", opacity: 0.7 }}>
                                ↗
                              </span>
                            </button>
                          ) : (
                            <code style={{ fontSize: 11 }}>{s.step_id}</code>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>{s.heading}</td>
                        <td>
                          <span className={`chip ${isFormStep ? "chip-blue" : "chip-gray"}`}>
                            {s.type}
                          </span>
                        </td>
                        <td>
                          {s.mandatory ? (
                            <span className="chip chip-red">required</span>
                          ) : (
                            <span className="chip chip-gray">optional</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
