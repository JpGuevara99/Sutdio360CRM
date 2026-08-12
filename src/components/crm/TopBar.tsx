"use client";

import { useAuth } from "@/components/auth/AuthProvider";

export function TopBar({ title }: { title: string }) {
  const { user, logout, configured } = useAuth();

  return (
    <header className="print:hidden flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <h1 className="text-lg font-medium text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          {user?.email ?? (configured ? "Sesión activa" : "Modo desarrollo")}
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-full px-3 py-1.5 text-sm text-primary-text hover:bg-primary-soft"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
