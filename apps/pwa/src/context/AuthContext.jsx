import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiUrl } from "@/lib/api";

const AuthContext = createContext(null);

/** Padre/menor de demo: UUID válido para todas las rutas `/api/*` sin autenticación. */
export const DEMO_PARENT_ID = "00000000-0000-4000-8000-000000000001";

async function fetchDashboardMinorsCount(userId) {
  const res = await fetch(`${apiUrl("/api/dashboard")}?parent_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, count: 0 };
  const data = await res.json();
  const n = Array.isArray(data.minors) ? data.minors.length : 0;
  return { ok: true, count: n };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken] = useState(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const sessionData = localStorage.getItem('kipi_session');
    let initialUser = null;
    
    if (sessionData) {
      try {
        initialUser = JSON.parse(sessionData);
        setUser(initialUser);
      } catch (e) {
        console.error("Error al parsear kipi_session", e);
      }
    }

    let cancelled = false;
    (async () => {
      if (initialUser?.id) {
        const { ok, count } = await fetchDashboardMinorsCount(initialUser.id);
        if (cancelled) return;
        if (ok) setIsNewUser(count === 0);
      }
      setAuthLoading(false);
    })();
    
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    // Simulamos un inicio de sesión exitoso y la creación del objeto usuario
    const loggedUser = {
      id: email === "ana@familia.com" || email === "demo@kipi.local"
        ? DEMO_PARENT_ID
        : (crypto.randomUUID ? crypto.randomUUID() : "12345678-1234-1234-1234-123456789012"),
      email: email,
      name: email.split("@")[0]
    };

    setUser(loggedUser);
    localStorage.setItem('kipi_session', JSON.stringify(loggedUser));

    const { ok, count } = await fetchDashboardMinorsCount(loggedUser.id);
    if (ok) setIsNewUser(count === 0);

    return { success: true, isNewUser: ok ? count === 0 : false };
  }, []);

  const register = useCallback(async (email, password, name) => {
    const newUser = {
      id: crypto.randomUUID ? crypto.randomUUID() : "12345678-1234-1234-1234-123456789012",
      email: email,
      name: name || email.split("@")[0]
    };

    setUser(newUser);
    localStorage.setItem('kipi_session', JSON.stringify(newUser));
    setIsNewUser(true);

    return { success: true, isNewUser: true };
  }, []);

  const completePairing = useCallback(async () => {
    if (!user?.id) return;
    const { ok, count } = await fetchDashboardMinorsCount(user.id);
    if (ok) setIsNewUser(count === 0);
    else setIsNewUser(false);
  }, [user?.id]);

  const logout = useCallback(async () => {
    setUser(null);
    localStorage.removeItem('kipi_session');
  }, []);

  const refreshBackendState = useCallback(async () => {
    await completePairing();
  }, [completePairing]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isNewUser,
        authLoading,
        supabaseMode: false,
        login,
        register,
        completePairing,
        logout,
        refreshBackendState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export default AuthContext;
