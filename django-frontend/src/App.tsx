import { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Shell, type PageKey } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SiteSettingsPage } from "./pages/SiteSettingsPage";
import { ClustersPage } from "./pages/ClustersPage";
import { CollectionMappingsPage } from "./pages/CollectionMappingsPage";
import { QuicklinksPage } from "./pages/QuicklinksPage";
import { SubmissionFormsPage } from "./pages/SubmissionFormsPage";
import { SubmissionProcessesPage } from "./pages/SubmissionProcessesPage";
import { FormLayoutsPage } from "./pages/FormLayoutsPage";
import { MetadataPage } from "./pages/MetadataPage";
import { AuditPage } from "./pages/AuditPage";
import { CrisLayoutPage } from "./pages/CrisLayoutPage";
import { FormBuilderPage } from "./pages/FormBuilderPage";
import { VocabularyEditorPage } from "./pages/VocabularyEditorPage";
import { ValuePairsPage } from "./pages/ValuePairsPage";

// Cross-page navigation state
interface NavState {
  formName?: string;
}

function PageRouter({
  page,
  navState,
  onNavigate,
}: {
  page: PageKey;
  navState: NavState;
  onNavigate: (page: PageKey, state?: NavState) => void;
}) {
  switch (page) {
    case "dashboard":      return <DashboardPage />;
    case "settings":       return <SiteSettingsPage />;
    case "clusters":       return <ClustersPage />;
    case "mappings":       return <CollectionMappingsPage />;
    case "quicklinks":     return <QuicklinksPage />;
    case "sub-processes":
      return (
        <SubmissionProcessesPage
          onNavigateToForm={(formName) => onNavigate("sub-forms", { formName })}
        />
      );
    case "form-layouts":   return <FormLayoutsPage />;
    case "cris-layout":    return <CrisLayoutPage />;
    case "metadata":       return <MetadataPage />;
    case "audit":          return <AuditPage />;

    // ── NEW pages ────────────────────────────────────────────────────────────
    case "form-builder":
      // Also accepts a formName from cross-nav (e.g. navigating from sub-processes)
      return <FormBuilderPage initialFormName={navState.formName} />;

    case "vocab-editor":
      return <VocabularyEditorPage />;

    case "value-pairs":
      return <ValuePairsPage />;

    default:
      return <DashboardPage />;
  }
}

function AppInner() {
  const { isAuthenticated, isLoading } = useAuth();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [navState, setNavState] = useState<NavState>({});

  function handleNavigate(nextPage: PageKey, state?: NavState) {
    setNavState(state ?? {});
    setPage(nextPage);
  }

  function handleSidebarNavigate(nextPage: PageKey) {
    // Clear carry-over state when the user clicks a sidebar item directly,
    // EXCEPT for form-builder which should re-mount cleanly.
    handleNavigate(nextPage);
  }

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: 14,
          gap: 10,
        }}
      >
        <span className="spinner" /> Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // sub-forms: re-mount when formName changes so the form is auto-selected
  const subFormsKey = page === "sub-forms" ? (navState.formName ?? "") : "";

  // form-builder: re-mount when formName changes (cross-nav from processes)
  const formBuilderKey = page === "form-builder" ? (navState.formName ?? "") : "";

  return (
    <Shell activePage={page} onNavigate={handleSidebarNavigate}>
      {page === "sub-forms" ? (
        <SubmissionFormsPage key={subFormsKey} initialFormName={navState.formName} />
      ) : page === "form-builder" ? (
        // Form builder needs its own key so it re-mounts on cross-nav
        <FormBuilderPage key={formBuilderKey} initialFormName={navState.formName} />
      ) : (
        <PageRouter page={page} navState={navState} onNavigate={handleNavigate} />
      )}
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
