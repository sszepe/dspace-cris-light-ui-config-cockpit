import { useEffect, useState } from "react";
import { api, type SiteSettings } from "../api/client";
import {
  Alert,
  EnabledChip,
  LoadingBlock,
  PageHeader,
  useNotice,
} from "../components/shared";
import { Spinner } from "../components/shared";

interface Flag {
  key: keyof SiteSettings;
  label: string;
  desc: string;
}

const FLAGS: Flag[] = [
  {
    key: "quicklinks_enabled",
    label: "Quicklinks tab",
    desc: 'Show the "Quicklinks" tab in the frontend navigation bar.',
  },
  {
    key: "communities_creation_enabled",
    label: "Community creation",
    desc: 'Show the "+ Create community" button and subcommunity actions on community tree nodes.',
  },
  {
    key: "communities_role_management_enabled",
    label: "Role management",
    desc: 'Show the "👥 Admins" button on community tree nodes for managing community administrators.',
  },
  {
    key: "collections_creation_enabled",
    label: "Collection creation",
    desc: 'Show the "+ collection" button on community tree nodes and the "🔐 Permissions" button on collection nodes.',
  },
];

export function SiteSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { notice, notify } = useNotice();

  useEffect(() => {
    api
      .siteSettings()
      .then((d) => {
        setSettings(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggle(key: keyof SiteSettings) {
    setSettings((s) => s && { ...s, [key]: !s[key] });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.patchSiteSettings({
        quicklinks_enabled: settings.quicklinks_enabled,
        communities_creation_enabled: settings.communities_creation_enabled,
        communities_role_management_enabled:
          settings.communities_role_management_enabled,
        collections_creation_enabled: settings.collections_creation_enabled,
      });
      setSettings(updated);
      notify("success", "Settings saved successfully.");
    } catch {
      notify("error", "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Site Settings"
        desc="Global feature flags served to all frontend clients. Changes take effect immediately."
      />

      {notice && (
        <Alert type={notice.type}>{notice.msg}</Alert>
      )}

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="card">
          <div className="card-title">Feature Flags</div>

          {FLAGS.map((f) => (
            <div className="toggle-row" key={f.key}>
              <div>
                <div className="toggle-label">{f.label}</div>
                <div className="toggle-desc">{f.desc}</div>
              </div>
              <div className="toggle-control">
                <EnabledChip enabled={!!settings?.[f.key]} />
                <input
                  type="checkbox"
                  id={`flag-${f.key}`}
                  checked={!!settings?.[f.key]}
                  onChange={() => toggle(f.key)}
                  aria-label={f.label}
                />
              </div>
            </div>
          ))}

          {settings?.updated_at && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 12,
              }}
            >
              Last saved: {new Date(settings.updated_at).toLocaleString()}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Spinner white /> Saving…
                </>
              ) : (
                "💾 Save Changes"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
