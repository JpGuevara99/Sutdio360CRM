"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TRASH_RETENTION_DAYS } from "@/lib/crm/types";

/**
 * Acción destructiva al final de una ficha: envía el proyecto o cliente a la
 * Papelera de Reciclaje. Exige escribir "eliminar" para confirmar.
 */
export function DeleteEntityAction({
  kind,
  id,
  label,
  extraWarning,
}: {
  kind: "project" | "client";
  id: string;
  /** Cómo se identifica el elemento en el diálogo, ej. "P-120" */
  label: string;
  extraWarning?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noun = kind === "project" ? "proyecto" : "cliente";
  const ready = word.trim().toLowerCase() === "eliminar";

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        kind === "project" ? `/api/projects/${id}` : `/api/clients/${id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `No se pudo eliminar el ${noun}`);
        setBusy(false);
        return;
      }
      router.push("/papelera");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWord("");
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#d93025]/40 px-3 py-1.5 text-xs font-medium text-[#d93025] transition hover:bg-[#d93025]/10"
      >
        <TrashIcon />
        Eliminar {noun}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-base font-medium text-foreground">
              Eliminar {noun} {label}
            </h3>
            <p className="mt-2 text-sm text-muted">
              Se enviará a la Papelera de Reciclaje, junto con su carpeta de
              Drive, y se guardará {TRASH_RETENTION_DAYS} días antes de
              descartarse.
              {extraWarning ? ` ${extraWarning}` : ""}
            </p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-muted">
                Escribe <strong className="text-foreground">eliminar</strong>{" "}
                para confirmar
              </span>
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoFocus
                placeholder="eliminar"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-[#d93025]"
              />
            </label>

            {error ? (
              <p className="mt-3 text-sm text-[#d93025]">{error}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-full px-4 py-2 text-sm text-muted-strong transition hover:bg-hover disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={busy || !ready}
                className="rounded-full bg-[#d93025] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#b3261e] disabled:opacity-50"
              >
                {busy ? "Eliminando…" : "Enviar a la papelera"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
