import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";

export type Role = "TEACHER" | "STUDENT" | "ADMIN";

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (email: string, password: string, role: "TEACHER" | "STUDENT") => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<CurrentUser>("/api/auth/me");
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401)) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<CurrentUser>("/api/auth/login", { email, password });
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (email: string, password: string, role: "TEACHER" | "STUDENT") => {
    const u = await api.post<CurrentUser>("/api/auth/register", { email, password, role });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth должен использоваться внутри <AuthProvider>");
  return ctx;
}
