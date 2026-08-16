"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { SyncButtons } from "@/components/crm/SyncButtons";
import {
  DASHBOARD_SEGMENT_LABELS,
  formatDashboardAmount,
  type DashboardMetrics,
  type DashboardSegment,
} from "@/lib/crm/dashboard-metrics";
import { formatEntityCode } from "@/lib/crm/project-codes";
import type { ProjectStatus } from "@/lib/crm/types";

const TZ = "America/Santiago";

type RecentProject = {
  id: string;
  publicCode: string;
  status: ProjectStatus;
  clientName: string;
  address: string | null;
  visitAt: string | null;
};

type DashboardPayload = {
  metrics: DashboardMetrics;
  recentProjects: RecentProject[];
};

function todayInputValue(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

function daysAgoInputValue(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

export function DashboardClient({
  usingFirestore,
  initial,
}: {
  usingFirestore: boolean;
  initial: DashboardPayload;
}) {
  const [from, setFrom] = useState(daysAgoInputValue(90));
  const [to, setTo] = useState(todayInputValue());
  const [segment, setSegment] = useState<DashboardSegment | "ALL">("ALL");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listSegment, setListSegment] = useState<DashboardSegment>("SENT");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (segment !== "ALL") params.set("segment", segment);
      if (amountMin.trim()) params.set("amountMin", amountMin.trim());
      if (amountMax.trim()) params.set("amountMax", amountMax.trim());
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      const json = (await res.json()) as DashboardPayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo cargar el dashboard");
        return;
      }
      setData(json);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [from, to, segment, amountMin, amountMax]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = data.metrics;
  const listItems = metrics.segments[listSegment].items;

  const donutData = useMemo(
    () =>
      (["SENT", "ACCEPTED", "REJECTED"] as DashboardSegment[]).map((key) => ({
        key,
        label: DASHBOARD_SEGMENT_LABELS[key],
        value: metrics.segments[key].count,
        amount: metrics.segments[key].amount,
        color:
          key === "SENT"
            ? "#f59e0b"
            : key === "ACCEPTED"
              ? "#10b981"
              : "#ef4444",
      })),
    [metrics],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <p className="max-w-xl text-sm text-muted">
          Visitas, reservas y semáforo comercial de cotizaciones (enviado /
          aceptado / rechazado) con montos según reglas de última cotización.
          {!usingFirestore ? (
            <span className="mt-1 block text-[#b06000]">
              Modo local: datos en archivo (sin Firestore).
            </span>
          ) : null}
        </p>
        <SyncButtons />
      </div>

      <section className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Visitas hoy" value={metrics.visitsToday} />
        <StatCard label="Proyectos reservados" value={metrics.reservados} />
        <StatCard
          label="Enviados"
          value={metrics.segments.SENT.count}
          accent="amber"
          sub={formatDashboardAmount(metrics.segments.SENT.amount)}
          onClick={() => setListSegment("SENT")}
          active={listSegment === "SENT"}
        />
        <StatCard
          label="Aceptados"
          value={metrics.segments.ACCEPTED.count}
          accent="green"
          sub={formatDashboardAmount(metrics.segments.ACCEPTED.amount)}
          onClick={() => setListSegment("ACCEPTED")}
          active={listSegment === "ACCEPTED"}
        />
        <StatCard
          label="Rechazados"
          value={metrics.segments.REJECTED.count}
          accent="red"
          sub={formatDashboardAmount(metrics.segments.REJECTED.amount)}
          onClick={() => setListSegment("REJECTED")}
          active={listSegment === "REJECTED"}
        />
      </section>

      <section className="shrink-0 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Desde">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Segmento (gráficos)">
            <select
              value={segment}
              onChange={(e) =>
                setSegment(e.target.value as DashboardSegment | "ALL")
              }
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="ALL">Todos</option>
              <option value="SENT">Enviados</option>
              <option value="ACCEPTED">Aceptados</option>
              <option value="REJECTED">Rechazados</option>
            </select>
          </Field>
          <Field label="Monto mín.">
            <input
              type="number"
              inputMode="numeric"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="0"
              className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Monto máx.">
            <input
              type="number"
              inputMode="numeric"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="—"
              className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc] disabled:opacity-60"
          >
            {loading ? "Actualizando…" : "Aplicar"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </section>

      <div className="grid min-h-0 shrink-0 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Cantidad y monto por semana
          </h3>
          <BarChart buckets={metrics.periodBuckets} />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Mix comercial
          </h3>
          <DonutChart slices={donutData} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="shrink-0 border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium text-foreground">
              {DASHBOARD_SEGMENT_LABELS[listSegment]} (
              {metrics.segments[listSegment].count})
            </h2>
            <p className="text-xs text-muted">
              Total{" "}
              {formatDashboardAmount(metrics.segments[listSegment].amount)}
            </p>
          </div>
          <ul className="crm-scroll min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {listItems.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted">
                Sin cotizaciones en este segmento para los filtros actuales.
              </li>
            ) : (
              listItems.map((item) => (
                <li key={item.quoteId}>
                  <Link
                    href={`/proyectos/${item.projectId}/cotizador/${item.quoteId}?from=cotizador`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-muted"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.quoteCode
                          ? `Cotización #${item.quoteCode}`
                          : item.title}{" "}
                        <span className="font-normal text-muted">
                          · {item.projectCode}
                        </span>
                      </p>
                      <p className="text-xs text-muted">{item.clientName}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatDashboardAmount(item.amount)}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="shrink-0 border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium text-foreground">
              Proyectos recientes
            </h2>
          </div>
          <ul className="crm-scroll min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {data.recentProjects.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted">
                Aún no hay proyectos.
              </li>
            ) : (
              data.recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/proyectos/${project.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {formatEntityCode(project.publicCode)}{" "}
                        <span className="font-normal text-muted">
                          · {project.clientName}
                        </span>
                      </p>
                      <p className="text-sm text-muted">
                        {project.address ?? "Sin dirección"}
                        {project.visitAt
                          ? ` · ${formatInTimeZone(new Date(project.visitAt), TZ, "dd MMM yyyy · HH:mm")}`
                          : null}
                      </p>
                    </div>
                    <StatusBadge status={project.status} />
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "amber" | "green" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const accentCls =
    accent === "amber"
      ? "border-amber-200 bg-amber-50"
      : accent === "green"
        ? "border-emerald-200 bg-emerald-50"
        : accent === "red"
          ? "border-red-200 bg-red-50"
          : "border-border bg-surface";
  const className = `rounded-xl border px-4 py-3 text-left ${accentCls} ${
    onClick ? "transition hover:brightness-95" : ""
  } ${active ? "ring-2 ring-primary" : ""}`;

  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-foreground">{value}</p>
      {sub ? (
        <p className="mt-0.5 text-xs font-medium tabular-nums text-muted-strong">
          {sub}
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function BarChart({
  buckets,
}: {
  buckets: DashboardMetrics["periodBuckets"];
}) {
  if (buckets.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">Sin datos en el rango</p>
    );
  }
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const maxAmount = Math.max(...buckets.map((b) => b.amount), 1);
  const w = 420;
  const h = 160;
  const padL = 28;
  const padB = 28;
  const padT = 12;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const gap = 6;
  const barW = Math.max(8, (innerW - gap * (buckets.length - 1)) / buckets.length);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img">
      {buckets.map((b, i) => {
        const x = padL + i * (barW + gap);
        const countH = (b.count / maxCount) * innerH * 0.55;
        const amountH = (b.amount / maxAmount) * innerH * 0.9;
        return (
          <g key={b.key}>
            <rect
              x={x}
              y={padT + innerH - amountH}
              width={barW * 0.45}
              height={amountH}
              fill="#94a3b8"
              rx={2}
            />
            <rect
              x={x + barW * 0.5}
              y={padT + innerH - countH}
              width={barW * 0.45}
              height={countH}
              fill="#1a73e8"
              rx={2}
            />
            <text
              x={x + barW / 2}
              y={h - 8}
              textAnchor="middle"
              className="fill-neutral-500"
              fontSize={9}
            >
              {b.label}
            </text>
          </g>
        );
      })}
      <text x={padL} y={10} fontSize={9} className="fill-neutral-500">
        Gris = monto · Azul = cantidad
      </text>
    </svg>
  );
}

function DonutChart({
  slices,
}: {
  slices: Array<{
    key: string;
    label: string;
    value: number;
    amount: number;
    color: string;
  }>;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 54;
  const cx = 70;
  const cy = 70;
  const stroke = 18;
  let offset = 0;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img">
        {total === 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
          />
        ) : (
          slices.map((slice) => {
            const len = (slice.value / total) * circ;
            const el = (
              <circle
                key={slice.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
            offset += len;
            return el;
          })
        )}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-neutral-800"
          fontSize={18}
          fontWeight={600}
        >
          {total}
        </text>
      </svg>
      <ul className="space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-muted-strong">
              {s.label}:{" "}
              <span className="font-medium text-foreground">{s.value}</span>
              <span className="text-muted">
                {" "}
                · {formatDashboardAmount(s.amount)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
