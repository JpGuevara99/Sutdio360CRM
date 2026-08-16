"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuth } from "@/components/auth/AuthProvider";

function friendlyAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/unauthorized-domain/i.test(message)) {
    return (
      "Firebase bloqueó este dominio/IP (auth/unauthorized-domain). " +
      "En Firebase Console → Authentication → Settings → Authorized domains, " +
      "agrega el host que usas (ej. 192.168.1.101) o prueba con modo desarrollo abajo."
    );
  }
  return message || "Error al iniciar sesión";
}

export default function LoginPage() {
  const { signInWithGoogle, signInDev, configured, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState("localhost");
  const [isLan, setIsLan] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setHost(h);
    setIsLan(/^\d+\.\d+\.\d+\.\d+$/.test(h));
  }, []);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      window.location.href = "/";
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--color-primary)_18%,transparent)_0%,transparent_45%),radial-gradient(circle_at_80%_0%,color-mix(in_srgb,var(--color-primary)_12%,transparent)_0%,transparent_40%)]" />

      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface/95 p-8 shadow-[0_1px_2px_rgba(60,64,67,.3),0_2px_6px_2px_rgba(60,64,67,.15)] dark:shadow-[0_1px_2px_rgba(0,0,0,.5),0_2px_6px_2px_rgba(0,0,0,.35)]">
        <div className="mb-6 flex flex-col items-start gap-2">
          <BrandLogo size="lg" priority adaptToTheme />
          <p className="text-sm text-muted">CRM Enterprise</p>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-muted">
          Acceso para el equipo con cuenta Google Workspace de la empresa.
        </p>

        {isLan ? (
          <p className="mb-4 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-text">
            Estás entrando por red local (<strong>{host}</strong>). Si Google
            falla, agrega ese host en Firebase → Authorized domains, o usa modo
            desarrollo.
          </p>
        ) : null}

        {configured ? (
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void handleGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-4 py-3 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
          >
            Continuar con Google
          </button>
        ) : null}

        {process.env.NODE_ENV === "development" && (
          <div className={configured ? "mt-3 space-y-3" : "space-y-3"}>
            {!configured ? (
              <p className="rounded-lg bg-[#fef7e0] px-3 py-2 text-sm text-[#b06000]">
                Firebase aún no está configurado. Usa modo desarrollo para
                probar el CRM en local.
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void signInDev();
              }}
              className={`w-full rounded-full px-4 py-3 text-sm font-medium ${
                configured
                  ? "border border-border bg-surface text-muted-strong hover:bg-surface-muted"
                  : "bg-[#1a73e8] text-white hover:bg-[#1765cc]"
              }`}
            >
              Entrar en modo desarrollo
            </button>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-[#d93025]">{error}</p> : null}
      </div>
    </main>
  );
}
