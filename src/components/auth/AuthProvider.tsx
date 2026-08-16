"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  getFirebaseAuth,
  googleProvider,
  isFirebaseConfigured,
} from "@/lib/firebase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDev: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(idToken: string) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "No se pudo crear la sesión");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    // onIdTokenChanged también avisa cuando Firebase rota el token (cada hora),
    // así la cookie de sesión del servidor nunca se queda atrás.
    return onIdTokenChanged(auth, async (next) => {
      setUser(next);
      if (next) {
        try {
          const token = await next.getIdToken(/* forceRefresh */ false);
          await persistSession(token);
        } catch (error) {
          console.error(error);
        }
      }
      setLoading(false);
    });
  }, [configured]);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    // Evita reutilizar una cuenta Google distinta a la de Workspace
    googleProvider.setCustomParameters({
      prompt: "select_account",
      hd: "studio360.cl",
    });
    const result = await signInWithPopup(auth, googleProvider);
    const token = await result.user.getIdToken();
    await persistSession(token);
  }, []);

  const signInDev = useCallback(async () => {
    await persistSession("dev-bypass");
    window.location.href = "/";
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    if (configured) {
      await signOut(getFirebaseAuth());
    }
    window.location.href = "/login";
  }, [configured]);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured,
      signInWithGoogle,
      signInDev,
      logout,
    }),
    [user, loading, configured, signInWithGoogle, signInDev, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
