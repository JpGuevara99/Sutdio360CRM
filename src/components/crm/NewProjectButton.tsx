"use client";

import { useState } from "react";
import {
  ProjectCreateForm,
  type ProjectCreateMode,
} from "@/components/crm/ProjectCreateForm";

/**
 * Botón "+ Nuevo proyecto" con las dos vías de creación: cliente nuevo o
 * cliente existente. Si se fija un cliente, crea directo sobre su código.
 */
export function NewProjectButton({
  lockedClient = null,
  size = "md",
}: {
  lockedClient?: { id: string; label: string } | null;
  size?: "sm" | "md";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<ProjectCreateMode | null>(null);

  const buttonClass =
    size === "sm"
      ? "rounded-full bg-[#1a73e8] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#1765cc]"
      : "rounded-full bg-[#1a73e8] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#1765cc]";

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (lockedClient) {
              setMode("existing-client");
              return;
            }
            setMenuOpen((prev) => !prev);
          }}
          className={buttonClass}
        >
          + Nuevo proyecto
        </button>

        {menuOpen && !lockedClient ? (
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
              {(
                [
                  {
                    value: "new-client",
                    label: "Nuevo cliente",
                    hint: "Genera un código nuevo",
                  },
                  {
                    value: "existing-client",
                    label: "Cliente existente",
                    hint: "Usa su código actual",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setMode(option.value);
                  }}
                  className="block w-full px-4 py-2 text-left transition hover:bg-hover"
                >
                  <span className="block text-sm text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {mode ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/35"
            onClick={() => setMode(null)}
          />
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Nuevo proyecto
              </h3>
              <p className="text-xs text-muted">
                {lockedClient
                  ? `Se creará dentro de ${lockedClient.label}`
                  : "El proyecto recibe su propio código y carpeta en Drive"}
              </p>
            </div>
            <div className="crm-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ProjectCreateForm
                initialMode={mode}
                lockedClient={lockedClient}
                onCancel={() => setMode(null)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
