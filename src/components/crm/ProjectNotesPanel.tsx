"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "America/Santiago";

export type NoteItem = {
  id: string;
  body: string;
  createdAt: string;
};

function toNoteItem(raw: {
  id: string;
  body: string;
  createdAt: string | Date;
}): NoteItem {
  return {
    id: raw.id,
    body: raw.body,
    createdAt:
      typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date(raw.createdAt).toISOString(),
  };
}

function sortNotes(list: NoteItem[]): NoteItem[] {
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function ProjectNotesPanel({
  projectId,
  initialNotes = [],
  compact = false,
}: {
  projectId: string;
  initialNotes?: NoteItem[];
  compact?: boolean;
}) {
  const [notes, setNotes] = useState<NoteItem[]>(() => sortNotes(initialNotes));
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deletingNote = deletingId
    ? (notes.find((n) => n.id === deletingId) ?? null)
    : null;

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        note?: { id: string; body: string; createdAt: string | Date };
        error?: string;
      };
      if (!res.ok || !data.note) {
        setError(data.error ?? "No se pudo crear la nota");
        return;
      }
      setNotes((list) => sortNotes([toNoteItem(data.note!), ...list]));
      setDraft("");
    } catch {
      setError("Error de red al crear la nota");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId || busy) return;
    const body = editBody.trim();
    if (!body) {
      setError("La nota no puede estar vacía");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/notes/${editingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        note?: { id: string; body: string; createdAt: string | Date };
        error?: string;
      };
      if (!res.ok || !data.note) {
        setError(data.error ?? "No se pudo editar la nota");
        return;
      }
      const updated = toNoteItem(data.note);
      setNotes((list) =>
        sortNotes(list.map((n) => (n.id === updated.id ? updated : n))),
      );
      setEditingId(null);
      setEditBody("");
    } catch {
      setError("Error de red al editar la nota");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deletingId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/notes/${deletingId}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo eliminar la nota");
        return;
      }
      setNotes((list) => list.filter((n) => n.id !== deletingId));
      if (editingId === deletingId) {
        setEditingId(null);
        setEditBody("");
      }
      setDeletingId(null);
    } catch {
      setError("Error de red al eliminar la nota");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">
        {compact ? "Notas" : "Notas del proyecto"}
      </h3>

      <form onSubmit={(e) => void addNote(e)} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={compact ? 3 : 4}
          placeholder="Escribe una nota…"
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Agregar nota"}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {notes.length === 0 ? (
        <p className="text-sm text-muted">Sin notas aún</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {notes.map((note) => {
            const editing = editingId === note.id;
            return (
              <li key={note.id} className="px-3 py-3">
                <p className="mb-1.5 text-[11px] leading-none text-muted">
                  {formatInTimeZone(
                    new Date(note.createdAt),
                    TZ,
                    "dd/MM/yyyy HH:mm",
                  )}
                </p>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={compact ? 3 : 4}
                      className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                        className="rounded-full bg-[#1a73e8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(null);
                          setEditBody("");
                        }}
                        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-strong hover:bg-hover"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {note.body}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(note.id);
                          setEditBody(note.body);
                          setError(null);
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeletingId(note.id)}
                        className="text-xs font-medium text-danger hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {deletingNote ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setDeletingId(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-foreground">
              Eliminar nota
            </h4>
            <p className="mb-4 text-sm text-muted-strong">
              ¿Seguro que quieres eliminar esta nota? Esta acción no se puede
              deshacer.
            </p>
            <p className="mb-4 line-clamp-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
              {deletingNote.body}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeletingId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete()}
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
