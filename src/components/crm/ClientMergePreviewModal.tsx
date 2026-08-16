"use client";

import { clientFullName } from "@/lib/crm/labels";
import type { ClientMergePreview } from "@/lib/crm/merge-clients-types";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { useState } from "react";

export function ClientMergePreviewModal({
  preview,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  preview: ClientMergePreview;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const keeper = preview.keeper;
  const absorbed = preview.mergeClients;
  const movingProjects = preview.projects.filter(
    (project) => project.fromClientId !== keeper.id,
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Cerrar"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">
            Confirmar combinación
          </h3>
          <p className="text-xs text-muted">
            Revisa los datos del cliente unificado antes de continuar
          </p>
        </div>

        <div className="crm-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="rounded-lg border border-danger-border bg-danger-soft px-3 py-3 text-danger">
            <p className="font-medium">¿Estás seguro de hacer esta acción?</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              Es irreversible. Los proyectos y las carpetas de Drive del cliente
              absorbido pasan a la carpeta del cliente que se conserva. El otro
              cliente y su carpeta se eliminan.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              El cliente unificado quedará así
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {formatEntityCode(keeper.leadCode)} · {clientFullName(keeper)}
            </p>
            <dl className="mt-3 space-y-1 text-xs text-muted-strong">
              <div className="flex justify-between gap-3">
                <dt>Email</dt>
                <dd>{keeper.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Teléfono</dt>
                <dd>{keeper.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Dirección</dt>
                <dd className="text-right">{keeper.address ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              Se conserva el cliente más antiguo. Su código y ficha permanecen.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
              Se absorbe y elimina
            </p>
            <ul className="space-y-1">
              {absorbed.map((client) => (
                <li
                  key={client.id}
                  className="rounded-lg border border-border px-3 py-2 text-muted-strong"
                >
                  {formatEntityCode(client.leadCode)} · {clientFullName(client)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
              Carpetas de proyectos a mover ({movingProjects.length})
            </p>
            {movingProjects.length === 0 ? (
              <p className="text-xs text-muted">
                No hay proyectos que reubicar en Drive; igual se unifica la
                ficha.
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {movingProjects.map((project) => (
                  <li key={project.id} className="flex justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {formatEntityCode(project.publicCode)}
                      {project.title ? ` · ${project.title}` : ""}
                    </span>
                    <span className="shrink-0 text-muted">
                      {project.fromClientCode} →{" "}
                      {formatEntityCode(keeper.leadCode)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2.5">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-xs text-muted-strong">
              Entiendo que esta combinación es irreversible y que las carpetas
              de proyectos quedarán dentro del cliente conservado.
            </span>
          </label>

          {error ? <p className="text-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !understood}
            onClick={onConfirm}
            className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Combinando…" : "Sí, combinar"}
          </button>
        </div>
      </div>
    </div>
  );
}
