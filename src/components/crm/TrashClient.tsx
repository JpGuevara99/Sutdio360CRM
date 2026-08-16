"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type TrashItem = {
  kind: "client" | "project";
  id: string;
  code: string;
  title: string;
  subtitle: string | null;
  deletedAt: string;
  daysLeft: number;
  /** Proyectos arrastrados por un cliente eliminado */
  children: { code: string; title: string }[];
};

type PendingAction =
  | { type: "purge"; item: TrashItem }
  | { type: "purge-all" }
  | { type: "restore-all" };

export function TrashClient({
  items,
  retentionDays,
  isAdmin,
}: {
  items: TrashItem[];
  retentionDays: number;
  /** El borrado definitivo y las acciones masivas son solo para ADMIN */
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.code, item.title, item.subtitle ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  const clients = filtered.filter((item) => item.kind === "client");
  const projects = filtered.filter((item) => item.kind === "project");

  async function send(body: unknown, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar la acción");
        return;
      }
      setPending(null);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="relative min-w-0 max-w-sm flex-1">
          <span className="sr-only">Buscar en la papelera</span>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código o nombre…"
            className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        {isAdmin ? (
          <>
            <button
              type="button"
              disabled={items.length === 0 || busy !== null}
              onClick={() => setPending({ type: "restore-all" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary-soft/40 disabled:opacity-50"
            >
              <RestoreIcon />
              Restaurar todo
            </button>
            <button
              type="button"
              disabled={items.length === 0 || busy !== null}
              onClick={() => setPending({ type: "purge-all" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d93025]/40 px-3.5 py-1.5 text-sm font-medium text-[#d93025] transition hover:bg-[#d93025]/10 disabled:opacity-50"
            >
              <TrashIcon />
              Eliminar permanentemente
            </button>
          </>
        ) : null}
      </div>

      <p className="shrink-0 text-xs text-muted">
        Los elementos se guardan {retentionDays} días —incluidas sus carpetas de
        Drive— y luego se descartan automáticamente.
        {isAdmin
          ? null
          : " El borrado definitivo lo hace un administrador."}
      </p>

      {error ? (
        <p className="shrink-0 rounded-lg border border-[#d93025]/40 bg-[#d93025]/10 px-3 py-2 text-sm text-[#d93025]">
          {error}
        </p>
      ) : null}

      <div className="crm-scroll min-h-0 flex-1 space-y-6 overflow-auto">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
            <p className="text-sm text-muted">La papelera está vacía.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-1 py-8 text-sm text-muted">
            No hay elementos que coincidan con la búsqueda.
          </p>
        ) : null}

        {clients.length > 0 ? (
          <TrashGroup
            title="Clientes"
            hint="Al restaurar un cliente vuelven también sus proyectos"
            items={clients}
            busy={busy}
            canPurge={isAdmin}
            onRestore={(item) =>
              void send(
                { action: "restore", kind: item.kind, id: item.id },
                `restore-${item.id}`,
              )
            }
            onPurge={(item) => setPending({ type: "purge", item })}
          />
        ) : null}

        {projects.length > 0 ? (
          <TrashGroup
            title="Proyectos"
            hint="Su cliente sigue activo"
            items={projects}
            busy={busy}
            canPurge={isAdmin}
            onRestore={(item) =>
              void send(
                { action: "restore", kind: item.kind, id: item.id },
                `restore-${item.id}`,
              )
            }
            onPurge={(item) => setPending({ type: "purge", item })}
          />
        ) : null}
      </div>

      {pending ? (
        <PurgeConfirmModal
          key={pending.type === "purge" ? pending.item.id : pending.type}
          pending={pending}
          busy={busy !== null}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (pending.type === "restore-all") {
              void send({ action: "restore-all" }, "restore-all");
              return;
            }
            if (pending.type === "purge-all") {
              void send({ action: "purge-all" }, "purge-all");
              return;
            }
            void send(
              {
                action: "purge",
                kind: pending.item.kind,
                id: pending.item.id,
              },
              `purge-${pending.item.id}`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function TrashGroup({
  title,
  hint,
  items,
  busy,
  canPurge,
  onRestore,
  onPurge,
}: {
  title: string;
  hint: string;
  items: TrashItem[];
  busy: string | null;
  canPurge: boolean;
  onRestore: (item: TrashItem) => void;
  onPurge: (item: TrashItem) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <h3 className="text-sm font-medium text-foreground">
          {title}{" "}
          <span className="text-muted">({items.length})</span>
        </h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li
            key={`${item.kind}-${item.id}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.code} · {item.title}
              </p>
              {item.subtitle ? (
                <p className="truncate text-xs text-muted">{item.subtitle}</p>
              ) : null}
              {item.children.length > 0 ? (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {item.children.length}{" "}
                  {item.children.length === 1 ? "proyecto" : "proyectos"}:{" "}
                  {item.children.map((child) => child.code).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs ${
                  item.daysLeft <= 7 ? "text-[#d93025]" : "text-muted"
                }`}
              >
                {item.daysLeft === 0
                  ? "Se descarta hoy"
                  : `Quedan ${item.daysLeft} ${
                      item.daysLeft === 1 ? "día" : "días"
                    }`}
              </span>
              <div className="flex items-center gap-1">
                <IconButton
                  label="Restaurar"
                  disabled={busy !== null}
                  onClick={() => onRestore(item)}
                >
                  <RestoreIcon />
                </IconButton>
                {canPurge ? (
                  <IconButton
                    label="Eliminar permanentemente"
                    danger
                    disabled={busy !== null}
                    onClick={() => onPurge(item)}
                  >
                    <TrashIcon />
                  </IconButton>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PurgeConfirmModal({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [word, setWord] = useState("");
  const isRestore = pending.type === "restore-all";
  const needsWord = !isRestore;
  const ready = !needsWord || word.trim().toLowerCase() === "eliminar";

  const title = isRestore
    ? "Restaurar todos los elementos"
    : pending.type === "purge-all"
      ? "Eliminar permanentemente todo"
      : `Eliminar permanentemente ${pending.item.code}`;

  const body = isRestore
    ? "Los clientes y proyectos volverán a sus áreas, junto con sus carpetas de Drive."
    : pending.type === "purge-all"
      ? "Se borrarán para siempre todos los clientes y proyectos de la papelera, con sus cotizaciones, notas y carpetas de Drive. Esta acción es irreversible."
      : "Se borrará para siempre, con sus cotizaciones, notas y carpeta de Drive. Esta acción es irreversible.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted">{body}</p>

        {needsWord ? (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-muted">
              Escribe <strong className="text-foreground">eliminar</strong> para
              confirmar
            </span>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-[#d93025]"
            />
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm text-muted-strong transition hover:bg-hover disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !ready}
            className={`rounded-full px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
              isRestore
                ? "bg-[#1a73e8] hover:bg-[#1765cc]"
                : "bg-[#d93025] hover:bg-[#b3261e]"
            }`}
          >
            {busy
              ? "Procesando…"
              : isRestore
                ? "Restaurar todo"
                : "Eliminar para siempre"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent transition disabled:opacity-40 ${
        danger
          ? "text-[#d93025] hover:border-[#d93025]/40 hover:bg-[#d93025]/10"
          : "text-muted-strong hover:border-border hover:bg-hover"
      }`}
    >
      {children}
    </button>
  );
}

function RestoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
