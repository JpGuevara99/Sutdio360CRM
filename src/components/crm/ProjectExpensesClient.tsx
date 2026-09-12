"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  PROJECT_EXPENSE_CATEGORIES,
  PROJECT_EXPENSE_CATEGORY_LABELS,
  formatClp,
  formatDecimalInput,
  parseDecimalNumber,
} from "@/lib/crm/labels";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type {
  ExpenseDashboard,
  ExpenseGranularity,
  ExpenseProjectRow,
  SerializedExpense,
} from "@/lib/crm/project-expense-metrics";
import type { ProjectExpenseCategory } from "@/lib/crm/types";

const TZ = "America/Santiago";

function todayInputValue(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

function startOfWeekInputValue(): string {
  const now = new Date();
  const zoned = new Date(
    formatInTimeZone(now, TZ, "yyyy-MM-dd") + "T12:00:00",
  );
  const day = zoned.getDay();
  const diff = day === 0 ? 6 : day - 1;
  zoned.setDate(zoned.getDate() - diff);
  return formatInTimeZone(zoned, TZ, "yyyy-MM-dd");
}

function startOfMonthInputValue(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-01");
}

function startOfYearInputValue(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-01-01");
}

type ExpenseFormState = {
  amount: string;
  description: string;
  category: ProjectExpenseCategory;
  expenseDate: string;
};

function emptyExpenseForm(): ExpenseFormState {
  return {
    amount: "",
    description: "",
    category: "OTROS",
    expenseDate: todayInputValue(),
  };
}

export function ProjectExpensesClient({
  initial,
}: {
  initial: ExpenseDashboard;
}) {
  const [from, setFrom] = useState(startOfYearInputValue());
  const [to, setTo] = useState(todayInputValue());
  const [query, setQuery] = useState("");
  const [granularity, setGranularity] = useState<ExpenseGranularity>("month");
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | "picker" | null>(null);
  const [editingExpense, setEditingExpense] = useState<SerializedExpense | null>(
    null,
  );
  const [deletingExpense, setDeletingExpense] =
    useState<SerializedExpense | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(emptyExpenseForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerProjectId, setPickerProjectId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (query.trim()) params.set("q", query.trim());
      params.set("granularity", granularity);
      const res = await fetch(`/api/project-expenses?${params.toString()}`);
      const json = (await res.json()) as {
        dashboard?: ExpenseDashboard;
        error?: string;
      };
      if (!res.ok || !json.dashboard) {
        setError(json.error ?? "No se pudieron cargar los gastos");
        return;
      }
      setData(json.dashboard);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [from, to, query, granularity]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRow = useMemo(
    () => data.rows.find((row) => row.projectId === selectedId) ?? null,
    [data.rows, selectedId],
  );
  const selectedExpenses = selectedId
    ? (data.expensesByProject[selectedId] ?? [])
    : [];

  const maxBucket = Math.max(1, ...data.buckets.map((b) => b.amount));

  function applyPreset(kind: "today" | "week" | "month" | "year") {
    setTo(todayInputValue());
    if (kind === "today") setFrom(todayInputValue());
    if (kind === "week") setFrom(startOfWeekInputValue());
    if (kind === "month") setFrom(startOfMonthInputValue());
    if (kind === "year") setFrom(startOfYearInputValue());
  }

  function openAdd(projectId: string | "picker") {
    setAddingFor(projectId);
    setEditingExpense(null);
    setForm(emptyExpenseForm());
    setFormError(null);
    setPickerProjectId(
      projectId === "picker" ? (data.rows[0]?.projectId ?? "") : "",
    );
  }

  function openEdit(expense: SerializedExpense) {
    setEditingExpense(expense);
    setAddingFor(null);
    setForm({
      amount: formatDecimalInput(expense.amount, 2),
      description: expense.description,
      category: expense.category,
      expenseDate: formatInTimeZone(new Date(expense.expenseDate), TZ, "yyyy-MM-dd"),
    });
    setFormError(null);
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseDecimalNumber(form.amount, 2);
    if (amount == null || amount <= 0) {
      setFormError("Ingresa un monto válido");
      return;
    }
    const projectId =
      editingExpense?.projectId ??
      (addingFor === "picker" ? pickerProjectId : addingFor);
    if (!projectId) {
      setFormError("Selecciona un proyecto");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(
        editingExpense
          ? `/api/projects/${projectId}/expenses/${editingExpense.id}`
          : `/api/projects/${projectId}/expenses`,
        {
          method: editingExpense ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            description: form.description.trim(),
            category: form.category,
            expenseDate: form.expenseDate,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(json.error ?? "No se pudo guardar el gasto");
        return;
      }
      setAddingFor(null);
      setEditingExpense(null);
      setSelectedId(projectId);
      await load();
    } catch {
      setFormError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteExpense() {
    if (!deletingExpense) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${deletingExpense.projectId}/expenses/${deletingExpense.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "No se pudo eliminar el gasto");
      } else {
        await load();
      }
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
      setDeletingExpense(null);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Proyectos concretados"
          value={String(data.projectCount)}
        />
        <StatCard
          label="Monto original"
          value={formatClp(data.originalAmount)}
        />
        <StatCard label="Gastos" value={formatClp(data.expenseAmount)} />
        <StatCard
          label="Resultado"
          value={formatClp(data.result)}
          tone={data.result >= 0 ? "good" : "bad"}
        />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Desde</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Hasta</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["today", "Hoy"],
                ["week", "Semana"],
                ["month", "Mes"],
                ["year", "Año"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-hover"
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block min-w-[180px] flex-1 text-sm">
            <span className="mb-1 block text-muted">Buscar</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Código o cliente…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Gráfico</span>
            <select
              value={granularity}
              onChange={(e) =>
                setGranularity(e.target.value as ExpenseGranularity)
              }
              className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
            >
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => openAdd("picker")}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]"
          >
            + Agregar gasto
          </button>
        </div>

        {data.buckets.length > 0 ? (
          <div className="mt-4 flex h-28 items-end gap-1.5">
            {data.buckets.map((bucket) => (
              <div
                key={bucket.key}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${bucket.label}: ${formatClp(bucket.amount)}`}
              >
                <div
                  className="w-full rounded-t bg-[#1a73e8]/80"
                  style={{
                    height: `${Math.max(8, (bucket.amount / maxBucket) * 100)}%`,
                  }}
                />
                <span className="truncate text-[10px] text-muted">
                  {bucket.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            No hay gastos en este periodo.
          </p>
        )}
        {loading ? (
          <p className="mt-2 text-xs text-muted">Actualizando…</p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Proyectos concretados
          </h2>
        </div>
        {data.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            No hay proyectos concretados en este rango.
          </p>
        ) : (
          <div className="crm-scroll overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/80 text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Proyecto</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Cierre</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Original
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Gastos
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Resultado
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Entradas
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.projectId}
                    className="cursor-pointer border-b border-border/70 last:border-b-0 hover:bg-surface-muted/70"
                    onClick={() => setSelectedId(row.projectId)}
                  >
                    <td className="px-4 py-2.5 font-medium text-primary">
                      {formatEntityCode(row.publicCode)}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {row.clientName}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {formatInTimeZone(new Date(row.closedAt), TZ, "dd/MM/yyyy")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatClp(row.closedAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatClp(row.totalExpenses)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        row.netAmount >= 0 ? "text-emerald-600" : "text-danger"
                      }`}
                    >
                      {formatClp(row.netAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">
                      {row.expenseCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRow ? (
        <ExpenseHistoryPanel
          row={selectedRow}
          expenses={selectedExpenses}
          onClose={() => setSelectedId(null)}
          onAdd={() => openAdd(selectedRow.projectId)}
          onEdit={openEdit}
          onDelete={setDeletingExpense}
        />
      ) : null}

      {addingFor || editingExpense ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => {
              setAddingFor(null);
              setEditingExpense(null);
            }}
          />
          <form
            onSubmit={(e) => void submitExpense(e)}
            className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-foreground">
              {editingExpense ? "Editar gasto" : "Agregar gasto"}
            </h3>
            {addingFor === "picker" ? (
              <label className="mt-4 block text-sm">
                <span className="mb-1 block text-muted">Proyecto</span>
                <select
                  value={pickerProjectId}
                  onChange={(e) => setPickerProjectId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
                >
                  {data.rows.length === 0 ? (
                    <option value="">No hay proyectos concretados</option>
                  ) : (
                    data.rows.map((row) => (
                      <option key={row.projectId} value={row.projectId}>
                        {formatEntityCode(row.publicCode)} · {row.clientName}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Fecha</span>
                <input
                  type="date"
                  required
                  value={form.expenseDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expenseDate: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Monto</span>
                <input
                  required
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-muted">Tipo</span>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value as ProjectExpenseCategory,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
                >
                  {PROJECT_EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {PROJECT_EXPENSE_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-muted">Descripción</span>
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </label>
            </div>
            {formError ? (
              <p className="mt-3 text-sm text-danger">{formError}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddingFor(null);
                  setEditingExpense(null);
                }}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deletingExpense ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            onClick={() => setDeletingExpense(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">
              Eliminar gasto
            </h3>
            <p className="mt-2 text-sm text-muted-strong">
              ¿Seguro que quieres eliminar este gasto de{" "}
              <span className="font-medium text-foreground">
                {formatClp(deletingExpense.amount)}
              </span>
              ? Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingExpense(null)}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmDeleteExpense()}
                className="rounded-full bg-[#d93025] px-4 py-2 text-sm font-medium text-white hover:bg-[#c5221f] disabled:opacity-60"
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

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-semibold tabular-nums ${
          tone === "good"
            ? "text-emerald-600"
            : tone === "bad"
              ? "text-danger"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function ExpenseHistoryPanel({
  row,
  expenses,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: {
  row: ExpenseProjectRow;
  expenses: SerializedExpense[];
  onClose: () => void;
  onAdd: () => void;
  onEdit: (expense: SerializedExpense) => void;
  onDelete: (expense: SerializedExpense) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/25"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Historial de gastos
            </p>
            <h2 className="truncate text-lg font-semibold text-foreground">
              {formatEntityCode(row.publicCode)}
            </h2>
            <p className="truncate text-sm text-muted">{row.clientName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-lg leading-none text-muted hover:bg-hover"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div className="space-y-3 border-b border-border px-5 py-4 text-sm">
          <p className="flex justify-between gap-3">
            <span className="text-muted">Original</span>
            <span className="tabular-nums">{formatClp(row.closedAmount)}</span>
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-muted">Gastos</span>
            <span className="tabular-nums">{formatClp(row.totalExpenses)}</span>
          </p>
          <p className="flex justify-between gap-3 font-medium">
            <span>Resultado</span>
            <span
              className={`tabular-nums ${
                row.netAmount >= 0 ? "text-emerald-600" : "text-danger"
              }`}
            >
              {formatClp(row.netAmount)}
            </span>
          </p>
          <Link
            href={`/proyectos/${row.projectId}`}
            className="inline-block text-sm text-primary hover:underline"
          >
            Abrir ficha del proyecto
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Entradas</h3>
            <button
              type="button"
              onClick={onAdd}
              className="rounded-full bg-[#1a73e8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1765cc]"
            >
              + Agregar
            </button>
          </div>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay gastos registrados.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {expenses.map((expense) => (
                <li key={expense.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatClp(expense.amount)}
                      </p>
                      <p className="text-xs text-muted">
                        {formatInTimeZone(
                          new Date(expense.expenseDate),
                          TZ,
                          "dd/MM/yyyy",
                        )}{" "}
                        · {PROJECT_EXPENSE_CATEGORY_LABELS[expense.category]}
                      </p>
                      {expense.description ? (
                        <p className="mt-1 text-sm text-muted-strong">
                          {expense.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(expense)}
                        className="rounded-full px-2 py-1 text-xs text-primary-text hover:bg-primary-soft"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(expense)}
                        className="rounded-full px-2 py-1 text-xs text-danger hover:bg-danger-soft"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
