import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type CockpitUser } from "../api/client";

interface AuthState {
  user: CockpitUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CockpitUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: seed CSRF cookie then check if we already have a session
  useEffect(() => {
    api
      .csrf()
      .then(() => api.me())
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await api.login(username, password);
    // After login, seed the CSRF cookie so subsequent writes work
    await api.csrf();
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
