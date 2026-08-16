import type { ReactNode } from "react";
import Link from "next/link";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-strong transition hover:border-primary hover:bg-primary-soft hover:text-primary disabled:cursor-default disabled:opacity-40";

export function QuotePreviewIconButton({ href }: { href: string }) {
  return (
    <Link href={href} title="Vista previa" aria-label="Vista previa" className={iconBtn}>
      <PreviewIcon />
    </Link>
  );
}

export function QuoteEditIconButton({ href }: { href: string }) {
  return (
    <Link href={href} title="Editar" aria-label="Editar" className={iconBtn}>
      <EditIcon />
    </Link>
  );
}

export function QuoteCloneIconButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title="Clonar"
      aria-label="Clonar"
      onClick={onClick}
      className={iconBtn}
    >
      <CloneIcon />
    </button>
  );
}

export function QuoteDeleteIconButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title="Eliminar (solo las primeras 48 horas)"
      aria-label="Eliminar"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger transition hover:bg-danger-soft"
    >
      <DeleteIcon />
    </button>
  );
}

export function QuoteActionIconRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-1">{children}</div>;
}

function PreviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CloneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}
