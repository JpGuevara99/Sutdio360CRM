"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  buildQuoteSummary,
  formatPercent,
  percentsFromQuote,
} from "@/lib/crm/quote-summary";
import {
  buildPricedQuoteLines,
  groupPricedLinesByCategory,
  type QuoteDocumentVariant,
} from "@/lib/crm/quote-priced-lines";
import {
  MATERIAL_UNIT_LABELS,
  clientFullName,
  formatClp,
  formatQty,
} from "@/lib/crm/labels";
import { groupQuoteLinesByCategory } from "@/lib/crm/quote-groups";
import { formatCompanyFooter } from "@/lib/crm/company";
import { QuoteObservationsBanner } from "@/components/crm/QuoteObservationsBanner";
import type {
  Client,
  CompanySettings,
  Project,
  QuoteLine,
  QuoteWithLines,
} from "@/lib/crm/types";

const TZ = "America/Santiago";

function shortUnit(unit: QuoteLine["unit"]): string {
  const full = MATERIAL_UNIT_LABELS[unit];
  const match = full.match(/\(([^)]+)\)/);
  return match?.[1] ?? unit.toLowerCase();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function QuotePrintView({
  quote,
  project,
  client,
  companySettings = null,
  entryFrom = "proyecto",
  variant = "simple",
}: {
  quote: QuoteWithLines;
  project: Project;
  client: Client;
  companySettings?: Pick<
    CompanySettings,
    "commercialAddress" | "phone"
  > | null;
  entryFrom?: "cotizador" | "proyecto";
  variant?: QuoteDocumentVariant;
}) {
  const detailed = variant === "detailed";
  const [downloading, setDownloading] = useState(false);
  const [drivePhase, setDrivePhase] = useState<
    "idle" | "confirm" | "uploading" | "done"
  >("idle");
  const [driveFile, setDriveFile] = useState<{
    name: string;
    webViewLink?: string | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const percents = useMemo(() => percentsFromQuote(quote), [quote]);
  const summary = useMemo(
    () => buildQuoteSummary(quote.lines, percents),
    [quote.lines, percents],
  );
  const simpleGroups = useMemo(
    () => groupQuoteLinesByCategory(quote.lines),
    [quote.lines],
  );
  const pricedGroups = useMemo(() => {
    if (!detailed) return [];
    return groupPricedLinesByCategory(
      buildPricedQuoteLines(quote.lines, percents),
    );
  }, [detailed, quote.lines, percents]);

  const fromQuery =
    entryFrom === "cotizador" ? "?from=cotizador" : "?from=proyecto";
  const editorHref = `/proyectos/${project.id}/cotizador/${quote.id}${fromQuery}`;
  const companyFooter = formatCompanyFooter(companySettings);
  const observations = (quote.observations ?? "").trim();
  const showObservations =
    quote.showObservations !== false && observations.length > 0;

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/quotes/${quote.id}/pdf?variant=${variant}`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "No se pudo descargar el PDF");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      downloadBlob(blob, match?.[1] ?? `Presupuesto-${variant}.pdf`);
      setMessage("PDF descargado.");
    } catch {
      setError("Error de red al descargar el PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadAndUploadToDrive() {
    setDrivePhase("uploading");
    setError(null);
    setMessage(null);
    setDriveFile(null);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant, includePdf: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        file?: { name: string; webViewLink?: string | null };
        pdfBase64?: string;
        fileName?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo subir el PDF a Drive");
        setDrivePhase("confirm");
        return;
      }
      if (data.pdfBase64) {
        downloadBlob(
          base64ToBlob(data.pdfBase64, "application/pdf"),
          data.fileName ?? data.file?.name ?? `Presupuesto-${variant}.pdf`,
        );
      }
      setDriveFile(data.file ?? null);
      setDrivePhase("done");
      setMessage(
        `PDF descargado y guardado en Drive${data.file?.name ? `: ${data.file.name}` : ""}.`,
      );
    } catch {
      setError("Error de red al subir el PDF");
      setDrivePhase("confirm");
    }
  }

  let itemIndex = 0;

  return (
    <div className="space-y-4">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={editorHref}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-strong hover:bg-hover"
          >
            ← Volver al editor
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Imprimir
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => void downloadPdf()}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
          >
            {downloading ? "Descargando…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            onClick={() => setDrivePhase("confirm")}
            className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1765cc]"
          >
            Descargar y subir al Drive
          </button>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {detailed ? "Presupuesto detallado" : "Presupuesto sin detalles"}
          </p>
          {message ? (
            <p className="text-sm text-[#137333]">{message}</p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </div>

      <p className="print:hidden text-xs text-muted">
        Al imprimir desde el navegador, desactiva “Encabezados y pies de página”
        para ocultar URL e IP. El PDF descargado no incluye esos metadatos.
      </p>

      <article className="quote-print mx-auto max-w-[210mm] bg-white p-8 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-5 flex items-start justify-between gap-6">
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- print/PDF preview needs plain img */}
            <img
              src="/brand/studio360-logo.png"
              alt="360studio"
              width={220}
              height={72}
              className="h-12 w-auto object-contain object-left"
            />
            <dl className="mt-4 space-y-1 text-[15px] leading-snug">
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <dt className="text-neutral-500">Cliente:</dt>
                <dd className="font-medium">{clientFullName(client)}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <dt className="text-neutral-500">Dirección:</dt>
                <dd>{client.address ?? "—"}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <dt className="text-neutral-500">Teléfono:</dt>
                <dd>{client.phone ?? "—"}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <dt className="text-neutral-500">Mail:</dt>
                <dd className="break-all">{client.email ?? "—"}</dd>
              </div>
            </dl>
          </div>
          <div className="text-right">
            <p className="text-sm text-neutral-600">
              Fecha:{" "}
              {formatInTimeZone(new Date(quote.updatedAt), TZ, "dd-MM-yyyy")}
            </p>
          </div>
        </header>

        <h1 className="mb-4 text-center text-xl font-semibold tracking-wide text-neutral-900">
          {quote.title}
        </h1>

        <table className="quote-print-table w-full table-fixed border-collapse text-[13.5px] leading-snug">
          <thead>
            <tr className="bg-neutral-800 text-left text-[12px] font-semibold uppercase tracking-wide text-white">
              <th className="w-10 px-1.5 py-2 text-center">It.</th>
              <th className="px-2 py-2">Denominación</th>
              <th className="w-[4.5rem] px-1.5 py-2 text-center">Unidades</th>
              <th className="w-14 px-1.5 py-2 text-center">Cant.</th>
              {detailed ? (
                <>
                  <th className="w-24 px-2 py-2 text-right">P/U</th>
                  <th className="w-28 px-2 py-2 text-right">Total</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {detailed
              ? pricedGroups.map((group) => {
                  const startIndex = itemIndex;
                  itemIndex += group.lines.length;
                  return (
                    <DetailedGroupRows
                      key={group.categoryName}
                      categoryName={group.categoryName}
                      lines={group.lines}
                      subtotal={group.subtotal}
                      startIndex={startIndex}
                      colSpan={6}
                    />
                  );
                })
              : simpleGroups.map((group) => {
                  const startIndex = itemIndex;
                  itemIndex += group.lines.length;
                  return (
                    <SimpleGroupRows
                      key={group.categoryName}
                      categoryName={group.categoryName}
                      lines={group.lines}
                      startIndex={startIndex}
                    />
                  );
                })}
          </tbody>
        </table>

        <div className="quote-print-end mt-6">
          <div className="ml-auto w-full max-w-xs text-sm">
            <div className="flex justify-between gap-4 border-b border-neutral-200 px-3 py-2">
              <span className="font-medium text-neutral-600">SUBTOTAL NETO</span>
              <span className="tabular-nums font-medium">
                {formatClp(summary.subtotalNeto)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-200 px-3 py-2">
              <span className="text-neutral-600">
                DESCUENTO {formatPercent(summary.discountPercent)}
              </span>
              <span className="tabular-nums">
                {formatClp(summary.discountAmount)}
              </span>
            </div>
            <div className="flex justify-between gap-4 bg-neutral-800 px-3 py-2.5 font-semibold text-white">
              <span>TOTAL NETO</span>
              <span className="tabular-nums">
                {formatClp(summary.totalNeto)}
              </span>
            </div>
          </div>

          {showObservations ? (
            <section className="mt-8 text-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Observaciones:
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-neutral-800">
                {observations}
              </p>
            </section>
          ) : null}

          <QuoteObservationsBanner
            warrantyMonths={quote.warrantyMonths ?? 0}
            installmentCount={quote.installmentCount ?? 0}
            installmentInterestFree={Boolean(quote.installmentInterestFree)}
          />

          <footer className="mt-8 border-t border-neutral-300 pt-3 text-center text-[11px] leading-relaxed text-neutral-500">
            <p>{companyFooter}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/studio360-logo.png"
              alt="360 Studio"
              className="mx-auto mt-2.5 h-5 w-auto object-contain opacity-90"
              draggable={false}
            />
          </footer>
        </div>
      </article>

      {drivePhase !== "idle" ? (
        <div className="print:hidden fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Cerrar"
            disabled={drivePhase === "uploading"}
            onClick={() => {
              if (drivePhase !== "uploading") setDrivePhase("idle");
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            {drivePhase === "confirm" ? (
              <>
                <h4 className="mb-2 text-base font-semibold text-foreground">
                  Descargar y subir al Drive
                </h4>
                <p className="mb-4 text-sm text-muted-strong">
                  Se generará el PDF ({detailed ? "detallado" : "sin detalles"}),
                  se descargará en tu equipo y se subirá a la carpeta Drive del
                  proyecto.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDrivePhase("idle")}
                    className="rounded-full border border-border px-4 py-2 text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadAndUploadToDrive()}
                    className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : null}
            {drivePhase === "uploading" ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#1a73e8] border-t-transparent" />
                <p className="text-sm font-medium text-foreground">
                  Generando y subiendo PDF…
                </p>
                <p className="mt-1 text-xs text-muted">
                  Esto puede tardar unos segundos.
                </p>
              </div>
            ) : null}
            {drivePhase === "done" ? (
              <>
                <h4 className="mb-2 text-base font-semibold text-foreground">
                  Listo
                </h4>
                <p className="mb-3 text-sm text-muted-strong">
                  El PDF se descargó y quedó en Drive
                  {driveFile?.name ? ` como ${driveFile.name}` : ""}.
                </p>
                {driveFile?.webViewLink ? (
                  <a
                    href={driveFile.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-4 inline-flex text-sm font-medium text-[#1a73e8] hover:underline"
                  >
                    Abrir en Drive
                  </a>
                ) : null}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDrivePhase("idle")}
                    className="rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SimpleGroupRows({
  categoryName,
  lines,
  startIndex,
}: {
  categoryName: string;
  lines: QuoteLine[];
  startIndex: number;
}) {
  return (
    <>
      <tr className="quote-print-group">
        <td className="w-10 bg-neutral-200 px-1.5 py-1.5" aria-hidden>
          &nbsp;
        </td>
        <td
          colSpan={3}
          className="bg-neutral-200 px-2 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-neutral-700"
        >
          {categoryName}
        </td>
      </tr>
      {lines.map((line, offset) => (
        <tr
          key={line.id}
          className="quote-print-row border-b border-neutral-200"
        >
          <td className="px-1.5 py-1.5 text-center text-neutral-500">
            {startIndex + offset + 1}
          </td>
          <td className="px-2 py-1.5">{line.name}</td>
          <td className="px-1.5 py-1.5 text-center text-neutral-600">
            {shortUnit(line.unit)}
          </td>
          <td className="px-1.5 py-1.5 text-center tabular-nums">
            {formatQty(line.quantity)}
          </td>
        </tr>
      ))}
    </>
  );
}

function DetailedGroupRows({
  categoryName,
  lines,
  subtotal,
  startIndex,
  colSpan,
}: {
  categoryName: string;
  lines: Array<
    QuoteLine & { unitPrice: number; lineTotal: number }
  >;
  subtotal: number;
  startIndex: number;
  colSpan: number;
}) {
  return (
    <>
      <tr className="quote-print-group">
        <td className="w-10 bg-neutral-200 px-1.5 py-1.5" aria-hidden>
          &nbsp;
        </td>
        <td
          colSpan={colSpan - 2}
          className="bg-neutral-200 px-2 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-neutral-700"
        >
          {categoryName}
        </td>
        <td className="bg-neutral-200 px-2 py-1.5 text-right text-[13px] font-semibold tabular-nums text-neutral-800">
          {formatClp(subtotal)}
        </td>
      </tr>
      {lines.map((line, offset) => (
        <tr
          key={line.id}
          className="quote-print-row border-b border-neutral-200"
        >
          <td className="px-1.5 py-1.5 text-center text-neutral-500">
            {startIndex + offset + 1}
          </td>
          <td className="px-2 py-1.5">{line.name}</td>
          <td className="px-1.5 py-1.5 text-center text-neutral-600">
            {shortUnit(line.unit)}
          </td>
          <td className="px-1.5 py-1.5 text-center tabular-nums">
            {formatQty(line.quantity)}
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums">
            {formatClp(line.unitPrice)}
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
            {formatClp(line.lineTotal)}
          </td>
        </tr>
      ))}
    </>
  );
}
