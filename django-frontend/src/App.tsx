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

function PageRouter({
  page,
  onNavigate,
}: {
  page: PageKey;
  onNavigate: (page: PageKey, state?: { formName?: string }) => void;
}) {
  switch (page) {
    case "dashboard":      return <DashboardPage />;
    case "settings":       return <SiteSettingsPage />;
    case "clusters":       return <ClustersPage />;
    case "mappings":       return <CollectionMappingsPage />;
    case "quicklinks":     return <QuicklinksPage />;
    case "sub-forms":      return <SubmissionFormsPage />;
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
    default:               return <DashboardPage />;
  }
}

function AppInner() {
  const { isAuthenticated, isLoading } = useAuth();
  const [page, setPage] = useState<PageKey>("dashboard");
  // Carries cross-page navigation state (e.g. which form to pre-select)
  const [pageState, setPageState] = useState<{ formName?: string }>({});

  function handleNavigate(nextPage: PageKey, state?: { formName?: string }) {
    setPageState(state ?? {});
    setPage(nextPage);
  }

  // When the user clicks a sidebar item directly, clear any carry-over state
  function handleSidebarNavigate(nextPage: PageKey) {
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

  // Re-mount SubmissionFormsPage whenever formName changes so it auto-selects
  const subFormsKey = page === "sub-forms" ? (pageState.formName ?? "") : "";

  return (
    <Shell activePage={page} onNavigate={handleSidebarNavigate}>
      {page === "sub-forms" ? (
        <SubmissionFormsPage key={subFormsKey} initialFormName={pageState.formName} />
      ) : (
        <PageRouter page={page} onNavigate={handleNavigate} />
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
