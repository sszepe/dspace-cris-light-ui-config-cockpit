/**
 * api/client.ts
 *
 * Thin fetch wrapper for the Config Cockpit.
 *
 * - Automatically includes the Django CSRF token (reads it from the cookie).
 * - Sends credentials (session cookie) on every request.
 * - Throws a structured ApiError on non-2xx responses.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public body: unknown
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

function getCsrfCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? m[1] : "";
}

type FetchOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiFetch<T = unknown>(
  path: string,
  { body, method = "GET", headers, ...rest }: FetchOptions = {}
): Promise<T> {
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isWrite ? { "X-CSRFToken": getCsrfCookie() } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as Record<string, unknown>).detail)
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, detail, data);
  }

  return data as T;
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

const BASE = "/api/dspace-config";

export const api = {
  // Auth (cockpit-specific endpoints)
  csrf:    ()         => apiFetch<{ csrfToken: string }>("/api/cockpit/auth/csrf/"),
  login:   (u: string, p: string) => apiFetch<CockpitUser>("/api/cockpit/auth/login/", { method: "POST", body: { username: u, password: p } }),
  logout:  ()         => apiFetch<void>("/api/cockpit/auth/logout/", { method: "POST" }),
  me:      ()         => apiFetch<CockpitUser>("/api/cockpit/auth/me/"),

  // Site settings
  siteSettings:    () => apiFetch<SiteSettings>(`${BASE}/site-settings/`),
  patchSiteSettings: (data: Partial<SiteSettings>) => apiFetch<SiteSettings>(`${BASE}/site-settings/`, { method: "PATCH", body: data }),

  // Clusters
  clusters:      ()           => apiFetch<Cluster[]>(`${BASE}/clusters/`),
  createCluster: (data: unknown) => apiFetch<Cluster>(`${BASE}/clusters/`, { method: "POST", body: data }),
  patchCluster:  (id: number, data: unknown) => apiFetch<Cluster>(`${BASE}/clusters/${id}/`, { method: "PATCH", body: data }),
  deleteCluster: (id: number) => apiFetch<void>(`${BASE}/clusters/${id}/`, { method: "DELETE" }),
  addEntityType: (clusterId: number, data: unknown) => apiFetch<EntityTypeEntry>(`${BASE}/clusters/${clusterId}/entity-types/`, { method: "POST", body: data }),
  patchEntityType: (id: number, data: unknown) => apiFetch<EntityTypeEntry>(`${BASE}/entity-types/${id}/`, { method: "PATCH", body: data }),
  deleteEntityType: (id: number) => apiFetch<void>(`${BASE}/entity-types/${id}/`, { method: "DELETE" }),

  // Collection mappings
  collectionMappings: () => apiFetch<CollectionMapping[]>(`${BASE}/collection-mappings/`),
  createMapping:  (data: unknown) => apiFetch<CollectionMapping>(`${BASE}/collection-mappings/`, { method: "POST", body: data }),
  patchMapping:   (id: number, data: unknown) => apiFetch<CollectionMapping>(`${BASE}/collection-mappings/${id}/`, { method: "PATCH", body: data }),
  deleteMapping:  (id: number) => apiFetch<void>(`${BASE}/collection-mappings/${id}/`, { method: "DELETE" }),

  // Quicklink presets
  presets:       () => apiFetch<QuickPreset[]>(`${BASE}/quicklinks/presets/`),
  createPreset:  (data: unknown) => apiFetch<QuickPreset>(`${BASE}/quickpresets/`, { method: "POST", body: data }),
  patchPreset:   (id: number, data: unknown) => apiFetch<QuickPreset>(`${BASE}/quickpresets/${id}/`, { method: "PATCH", body: data }),
  deletePreset:  (id: number) => apiFetch<void>(`${BASE}/quickpresets/${id}/`, { method: "DELETE" }),
  addFilter:     (presetId: number, data: unknown) => apiFetch<PresetFilter>(`${BASE}/quickpresets/${presetId}/filters/`, { method: "POST", body: data }),
  patchFilter:   (id: number, data: unknown) => apiFetch<PresetFilter>(`${BASE}/quickpreset-filters/${id}/`, { method: "PATCH", body: data }),
  deleteFilter:  (id: number) => apiFetch<void>(`${BASE}/quickpreset-filters/${id}/`, { method: "DELETE" }),

  // Submission forms
  submissionForms: () => apiFetch<SubmissionFormList[]>(`${BASE}/submission-forms/`),
  submissionForm:  (id: number) => apiFetch<SubmissionFormDetail>(`${BASE}/submission-forms/${id}/`),
  patchSubmissionFormField: (id: number, data: unknown) =>
    apiFetch<SubmissionFormField>(`${BASE}/submission-forms/fields/${id}/`, { method: "PATCH", body: data }),

  // Submission processes
  submissionProcesses: () => apiFetch<SubmissionProcessList[]>(`${BASE}/submission-processes/`),
  submissionProcess:   (id: number) => apiFetch<SubmissionProcess>(`${BASE}/submission-processes/${id}/`),
  patchSubmissionProcessStep: (id: number, data: unknown) =>
    apiFetch<SubmissionProcessStep>(`${BASE}/submission-process-steps/${id}/`, { method: "PATCH", body: data }),

  // Form layouts
  formLayouts:   () => apiFetch<FormLayout[]>(`${BASE}/form-layouts/`),
  createLayout:  (data: unknown) => apiFetch<FormLayout>(`${BASE}/form-layouts/`, { method: "POST", body: data }),
  patchLayout:   (id: number, data: unknown) => apiFetch<FormLayout>(`${BASE}/form-layouts/${id}/`, { method: "PATCH", body: data }),
  deleteLayout:  (id: number) => apiFetch<void>(`${BASE}/form-layouts/${id}/`, { method: "DELETE" }),

  // Metadata
  metadataSchemas: (q?: string) => apiFetch<MetadataSchema[]>(`${BASE}/metadata-schemas/${q ? "?q=" + encodeURIComponent(q) : ""}`),
  metadataSchema:  (id: number)  => apiFetch<MetadataSchemaDetail>(`${BASE}/metadata-schemas/${id}/`),
  metadataFields:  (q: string)  => apiFetch<MetadataField[]>(`${BASE}/metadata-fields/?q=${encodeURIComponent(q)}`),
  metadataFieldsBySchema: (schema: string) => apiFetch<MetadataField[]>(`${BASE}/metadata-fields/?schema=${encodeURIComponent(schema)}&q=`),

  // Audit
  auditFormsSummary: () => apiFetch<unknown>(`${BASE}/audit/forms-summary/`),
  auditFieldUsage:   () => apiFetch<unknown>(`${BASE}/audit/field-usage/`),
};

// ── Domain types ──────────────────────────────────────────────────────────────

export interface CockpitUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
}

export interface SiteSettings {
  quicklinks_enabled: boolean;
  communities_creation_enabled: boolean;
  communities_role_management_enabled: boolean;
  collections_creation_enabled: boolean;
  updated_at: string;
}

export interface EntityTypeEntry {
  id: number;
  entity_type_label: string;
  sort_order: number;
}

export interface Cluster {
  id: number;
  key: string;
  label: string;
  description: string;
  sort_order: number;
  enabled: boolean;
  entity_types: EntityTypeEntry[];
}

export interface CollectionConditions {
  dcTypeIncludes?: string[];
  risfundingStatusIn?: string[];
}

export interface CollectionMapping {
  id: number;
  entity_type: string;
  collection_id: string;
  label: string;
  sort_order: number;
  conditions: CollectionConditions | null;
  created_at: string;
  updated_at: string;
}

export interface PresetFilter {
  id: number;
  key: string;
  label: string;
  facet_name: string;
  kind: "text" | "date";
  placeholder: string;
  sort_order: number;
}

export interface QuickPreset {
  id: number;
  key: string;
  label: string;
  description: string;
  sort_order: number;
  enabled: boolean;
  filters: PresetFilter[];
  created_at: string;
  updated_at: string;
}

export interface SubmissionFormList {
  id: number;
  name: string;
  contains_required: boolean;
  field_count: number;
  required_field_count: number;
  imported_at: string;
}

export interface SubmissionFormField {
  id: number;
  row: number;
  col: number;
  field: string;
  label: string;
  input_type: string;
  is_required: boolean;
  required_msg: string;
  repeatable: boolean;
  vocabulary: string;
  vocabulary_closed: boolean;
  value_pairs_name: string;
  hint: string;
  style: string;
  regex: string;
  language_codes: string[];
  type_binds: string[];
  child_form_name: string;
  child_form: number | null;
  child_form_name_resolved: string | null;
}

export interface SubmissionFormDetail extends SubmissionFormList {
  fields: SubmissionFormField[];
}

export interface SubmissionProcessList {
  id: number;
  name: string;
  step_count: number;
  imported_at: string;
}

export interface SubmissionProcessStep {
  id: number;
  sort_order: number;
  step_id: string;
  type: string;
  mandatory: boolean;
  heading: string;
  processing_class: string;
}

export interface SubmissionProcess extends SubmissionProcessList {
  steps: SubmissionProcessStep[];
}

export interface FormSection {
  id: number;
  key: string;
  label: string;
  sort_order: number;
  collapsed_by_default: boolean;
  helper_text_above: string;
  helper_text_below: string;
  field_overrides: Array<{ id: number; field_name: string; sort_order: number; label_override: string; hidden: boolean }>;
}

export interface FormConditionalBlock {
  id: number;
  sort_order: number;
  trigger_field: string;
  trigger_value: string;
  revealed_fields: string[];
  revealed_section: string;
}

export interface FormLayout {
  id: number;
  form_name: string;
  profile: string;
  collection: string | null;
  label: string;
  created_at: string;
  updated_at: string;
  sections: FormSection[];
  conditional_blocks: FormConditionalBlock[];
}

export interface MetadataSchema {
  id: number;
  name: string;
  namespace: string;
  title: string;
  source: string;
  field_count: number;
}

export interface MetadataSchemaDetail extends MetadataSchema {
  fields: MetadataField[];
}

export interface MetadataField {
  id: number;
  field: string;
  schema_name: string;
  element: string;
  qualifier: string;
  scope_note: string;
  source: string;
}
