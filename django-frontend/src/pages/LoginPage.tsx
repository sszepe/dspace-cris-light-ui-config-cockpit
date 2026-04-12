import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { Spinner } from "../components/shared";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Login failed — check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell" style={{ minHeight: "100vh" }}>
      {/* Minimal header (no user menu) */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">DC</div>
          <div className="header-title-block">
            <div className="header-title">DSpace CRIS Config Cockpit</div>
            <div className="header-sub">Configuration management</div>
          </div>
        </div>
      </header>

      <div className="login-page">
        <div className="login-card">
          <div className="login-title">Sign in</div>
          <div className="login-subtitle">
            Use your Django admin username and password.
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {error && (
              <div
                className="alert alert-error"
                style={{ marginBottom: 12 }}
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner white /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            Access is restricted to Django staff and superusers. Contact your
            system administrator if you need access.
          </div>
        </div>
      </div>

      <footer className="app-footer">
        <span>DSpace CRIS Config Cockpit</span>
      </footer>
    </div>
  );
}
