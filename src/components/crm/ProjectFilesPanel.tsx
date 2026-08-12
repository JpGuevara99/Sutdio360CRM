"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FileRef } from "@/lib/crm/types";

function isImage(file: FileRef): boolean {
  return Boolean(
    file.mimeType?.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name),
  );
}

export function ProjectFilesPanel({
  projectId,
  files: initialFiles,
  driveFolderUrl,
  compact = false,
}: {
  projectId: string;
  files: FileRef[];
  driveFolderUrl: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setFiles(initialFiles);
  }, [initialFiles]);

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    const body = new FormData();
    body.append("file", selected);

    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { error?: string; file?: FileRef };

    setUploading(false);
    event.target.value = "";

    if (!res.ok || !data.file) {
      setError(data.error ?? "No se pudo subir el archivo");
      return;
    }

    setFiles((prev) => [data.file!, ...prev]);
    setMessage(`Subido: ${data.file.name}`);
    router.refresh();
  }

  if (compact) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Archivos</h3>
          <label className="cursor-pointer rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]">
            {uploading ? "Subiendo…" : "Subir archivo"}
            <input
              type="file"
              accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.heic"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onUpload(e)}
            />
          </label>
        </div>
        <p className="text-xs text-muted">
          Ideal en terreno: foto, croquis o documento a Drive del proyecto.
        </p>
        {error ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-text">
            {message}
          </p>
        ) : null}
        {files.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay archivos.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {files.slice(0, 5).map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium text-foreground">
                  {file.name}
                </span>
                {file.webViewLink ? (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-primary hover:underline"
                  >
                    Ver
                  </a>
                ) : (
                  <a
                    href={`/api/files/${file.driveFileId}/content`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-muted hover:underline"
                  >
                    Abrir
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {files.length > 5 ? (
          <p className="text-xs text-muted">
            +{files.length - 5} más en la ficha completa
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Archivos del proyecto
          </h3>
          <p className="text-xs text-muted">
            Se guardan en la carpeta Drive de este proyecto (fotos, croquis,
            cotizaciones).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {driveFolderUrl ? (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-3 py-1.5 text-sm text-primary hover:bg-primary-soft"
            >
              Abrir en Drive
            </a>
          ) : null}
          <label className="cursor-pointer rounded-full bg-[#1a73e8] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1765cc]">
            {uploading ? "Subiendo…" : "Subir archivo"}
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onUpload(e)}
            />
          </label>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-[#d93025]">{error}</p> : null}

      {files.length === 0 ? (
        <p className="text-sm text-muted">
          Aún no hay archivos en este proyecto.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <li
              key={file.id}
              className="overflow-hidden rounded-lg border border-border"
            >
              {isImage(file) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${file.driveFileId}/content`}
                  alt={file.name}
                  className="h-36 w-full object-cover bg-[#f1f3f4]"
                />
              ) : (
                <div className="flex h-36 items-center justify-center bg-surface-muted text-sm text-muted">
                  {file.mimeType?.includes("pdf") ? "PDF" : "Archivo"}
                </div>
              )}
              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {file.webViewLink ? (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Ver en Drive
                    </a>
                  ) : null}
                  <a
                    href={`/api/files/${file.driveFileId}/content`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted hover:underline"
                  >
                    Abrir
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
