import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { applyTheme, persistThemeLocal, resolveInitialTheme } from "../theme";

const API = import.meta.env.VITE_API_URL || "/api";
const AuthContext = createContext(null);

// Once a user object arrives, the server-stored theme is the source of truth:
// apply it to <html> and mirror it into localStorage so the next pre-paint init
// (before this user is loaded) already matches.
function syncThemeFromUser(u) {
  if (u && (u.theme === "light" || u.theme === "dark")) {
    applyTheme(u.theme);
    persistThemeLocal(u.theme);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // current applied theme (drives the toggle UI); starts from the pre-paint choice
  const [theme, setThemeState] = useState(() => resolveInitialTheme());

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  const fetchMe = useCallback(async (token) => {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("unauthorized");
    return res.json();
  }, []);

  const refreshTokens = useCallback(async () => {
    const refresh = localStorage.getItem("refresh_token");
    if (!refresh) return null;
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh })
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return data.access_token;
  }, []);

  useEffect(() => {
    async function restore() {
      let token = localStorage.getItem("access_token");
      if (!token) { setLoading(false); return; }
      try {
        const me = await fetchMe(token);
        setUser(me); syncThemeFromUser(me); setThemeState(me.theme || "dark");
      } catch {
        const newToken = await refreshTokens();
        if (newToken) {
          try {
            const me = await fetchMe(newToken);
            setUser(me); syncThemeFromUser(me); setThemeState(me.theme || "dark");
          } catch { logout(); }
        } else { logout(); }
      } finally { setLoading(false); }
    }
    restore();
  }, [fetchMe, refreshTokens, logout]);

  const login = async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login fehlgeschlagen");
    }
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    const me = await fetchMe(data.access_token);
    setUser(me); syncThemeFromUser(me); setThemeState(me.theme || "dark");
  };

  const register = async (email, username, password) => {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Registrierung fehlgeschlagen");
    }
    await login(email, password);
  };

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const me = await fetchMe(token);
      setUser(me); syncThemeFromUser(me); setThemeState(me.theme || "dark");
    } catch {}
  }, [fetchMe]);

  // Toggle/apply theme. Applies instantly (CSS vars -> no layout jump), remembers
  // locally, and — if logged in — persists to the account so it follows devices.
  const setTheme = useCallback(async (next) => {
    const t = next === "light" ? "light" : "dark";
    applyTheme(t);
    persistThemeLocal(t);
    setThemeState(t);
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API}/auth/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme: t }),
      });
      if (res.ok) {
        const me = await res.json();
        setUser(me);
      }
    } catch {}
  }, []);

  // Bevorzugte Standard-Pausendauer (Sekunden) serverseitig speichern, damit sie
  // geräteübergreifend erhalten bleibt. Aktualisiert das lokale user-Objekt sofort.
  const setRestDefault = useCallback(async (seconds) => {
    const s = Math.max(5, Math.min(3600, Math.round(seconds)));
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API}/auth/rest-timer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rest_timer_seconds: s }),
      });
      if (res.ok) {
        const me = await res.json();
        setUser(me);
      }
    } catch {}
  }, []);

  const authFetch = useCallback(async (url, options = {}) => {
    let token = localStorage.getItem("access_token");
    const makeReq = (t) => fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${t}` }
    });
    let res = await makeReq(token);
    if (res.status === 401) {
      const newToken = await refreshTokens();
      if (!newToken) { logout(); throw new Error("Session abgelaufen"); }
      res = await makeReq(newToken);
      if (res.status === 401) { logout(); throw new Error("Session abgelaufen"); }
    }
    return res;
  }, [refreshTokens, logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, authFetch, refreshUser, theme, setTheme, setRestDefault }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
