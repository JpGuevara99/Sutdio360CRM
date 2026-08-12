import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type {
  Client,
  CompanySettings,
  Project,
  QuoteWithLines,
} from "@/lib/crm/types";
import {
  MATERIAL_UNIT_LABELS,
  clientFullName,
  formatClp,
  formatQty,
} from "@/lib/crm/labels";
import { groupQuoteLinesByCategory } from "@/lib/crm/quote-groups";
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
  COMPANY_EMAIL,
  QUOTE_PAYMENT_METHODS,
  QUOTE_VALIDITY_DAYS,
  formatCompanyFooter,
} from "@/lib/crm/company";
import { formatInTimeZone } from "date-fns-tz";

export { groupQuoteLinesByCategory } from "@/lib/crm/quote-groups";

const TZ = "America/Santiago";
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_IT = 26;
/** Misma geometría en simple y detallado: Unidades/Cant. no “saltan” a la derecha. */
const COL_UNIT = 50;
const COL_QTY = 46;
const COL_PU = 70;
const COL_TOTAL = 74;
/** Tipografía tabla (igual en ambas variantes): legible y caben ~15 ítems/página. */
const SIZE_HEADER = 8.5;
const SIZE_BODY = 9.5;
const ROW_STEP = 15;
const CAT_H = 16;

const ink = rgb(0.12, 0.12, 0.12);
const muted = rgb(0.42, 0.42, 0.42);
const line = rgb(0.82, 0.82, 0.82);
const headerBg = rgb(0.18, 0.18, 0.18);
const categoryBg = rgb(0.9, 0.9, 0.9);
const brand = rgb(0.89, 0.12, 0.15);

function shortUnit(unit: keyof typeof MATERIAL_UNIT_LABELS): string {
  const full = MATERIAL_UNIT_LABELS[unit];
  const match = full.match(/\(([^)]+)\)/);
  return match?.[1] ?? unit.toLowerCase();
}

function pdfSafe(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u00a0/g, " ")
    .replace(/–|—/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function clipText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const safe = pdfSafe(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let value = safe;
  while (
    value.length > 1 &&
    font.widthOfTextAtSize(`${value}...`, size) > maxWidth
  ) {
    value = value.slice(0, -1);
  }
  return `${value}...`;
}

function wrapPdfText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const safe = pdfSafe(text);
  const paragraphs = safe.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

async function embedBrandLogo(pdf: PDFDocument) {
  try {
    const logoPath = path.join(
      process.cwd(),
      "public",
      "brand",
      "studio360-logo.png",
    );
    const bytes = await readFile(logoPath);
    return pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function buildQuotePdfBuffer(options: {
  quote: QuoteWithLines;
  project: Project;
  client: Client;
  companySettings?: Pick<CompanySettings, "commercialAddress" | "phone"> | null;
  variant?: QuoteDocumentVariant;
}): Promise<Buffer> {
  const {
    quote,
    client,
    companySettings = null,
    variant = "simple",
  } = options;
  const detailed = variant === "detailed";
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedBrandLogo(pdf);
  const percents = percentsFromQuote(quote);
  const summary = buildQuoteSummary(quote.lines, percents);
  const simpleGroups = groupQuoteLinesByCategory(quote.lines);
  const pricedGroups = detailed
    ? groupPricedLinesByCategory(buildPricedQuoteLines(quote.lines, percents))
    : [];
  const footer = formatCompanyFooter(companySettings);
  const months = Math.max(0, Math.floor(quote.warrantyMonths ?? 0));
  const cuotas = Math.max(0, Math.floor(quote.installmentCount ?? 0));
  const sinInteres = Boolean(quote.installmentInterestFree) && cuotas > 0;
  const observations = (quote.observations ?? "").trim();

  /**
   * Detallado: It/Name/Unit/Qty/P/U/Total a ancho completo.
   * Simple: Name ocupa el hueco de P/U+Total; Unidades/Cant. van al borde
   * derecho (alineados con totales y banner), sin franja negra vacía.
   */
  const colName = detailed
    ? CONTENT_W - COL_IT - COL_UNIT - COL_QTY - COL_PU - COL_TOTAL
    : CONTENT_W - COL_IT - COL_UNIT - COL_QTY;
  const xIt = MARGIN;
  const xName = MARGIN + COL_IT;
  const xUnit = xName + colName;
  const xQty = xUnit + COL_UNIT;
  const xPu = xQty + COL_QTY;
  const xTotal = xPu + COL_PU;
  const rightEdge = MARGIN + CONTENT_W;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawLeft = (
    text: string,
    x: number,
    atY: number,
    size: number,
    useBold = false,
    color = ink,
  ) => {
    page.drawText(text, {
      x,
      y: atY,
      size,
      font: useBold ? fontBold : font,
      color,
    });
  };

  const drawRightIn = (
    text: string,
    colLeft: number,
    colWidth: number,
    atY: number,
    size: number,
    useBold = false,
    color = ink,
  ) => {
    const f = useBold ? fontBold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: colLeft + colWidth - 4 - w,
      y: atY,
      size,
      font: f,
      color,
    });
  };

  const drawCenterIn = (
    text: string,
    colLeft: number,
    colWidth: number,
    atY: number,
    size: number,
    useBold = false,
    color = ink,
  ) => {
    const f = useBold ? fontBold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: colLeft + (colWidth - w) / 2,
      y: atY,
      size,
      font: f,
      color,
    });
  };

  const drawText = (
    text: string,
    x: number,
    size = 10,
    bold = false,
    color = ink,
  ) => {
    page.drawText(pdfSafe(text), {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  const showObservations =
    quote.showObservations !== false && observations.length > 0;
  const bannerH = 72;
  const footerReserve = logo ? 56 : 42;
  /** Espacio reservado solo en páginas intermedias (sin banner ni pie comercial). */
  const CONTINUATION_BOTTOM = 36;

  const ensureSpace = (need: number, withTableHeader = true) => {
    if (y - need < CONTINUATION_BOTTOM) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      if (withTableHeader) drawTableHeader();
    }
  };

  /** Antes de totales/banner/pie: si no cabe el bloque final, nueva página limpia. */
  const ensureEndMatterSpace = (need: number) => {
    if (y - need < footerReserve + 8) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawFooter = () => {
    const size = 8;
    const text = clipText(font, footer || COMPANY_EMAIL, size, CONTENT_W);
    const footerTop = logo ? 52 : 38;
    page.drawLine({
      start: { x: MARGIN, y: footerTop },
      end: { x: PAGE_W - MARGIN, y: footerTop },
      thickness: 0.5,
      color: line,
    });
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: MARGIN + (CONTENT_W - width) / 2,
      y: footerTop - 14,
      size,
      font,
      color: muted,
    });
    if (logo) {
      const miniW = 52;
      const miniH = (logo.height / logo.width) * miniW;
      page.drawImage(logo, {
        x: MARGIN + (CONTENT_W - miniW) / 2,
        y: 10,
        width: miniW,
        height: miniH,
      });
    }
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 17,
      width: CONTENT_W,
      height: 19,
      color: headerBg,
    });
    const hy = y - 12;
    drawCenterIn("It.", xIt, COL_IT, hy, SIZE_HEADER, true, rgb(1, 1, 1));
    drawLeft("DENOMINACION", xName + 2, hy, SIZE_HEADER, true, rgb(1, 1, 1));
    drawCenterIn("UNIDADES", xUnit, COL_UNIT, hy, SIZE_HEADER, true, rgb(1, 1, 1));
    drawCenterIn("CANT.", xQty, COL_QTY, hy, SIZE_HEADER, true, rgb(1, 1, 1));
    if (detailed) {
      // Misma alineación que los montos (derecha), evita el “escalón” header↔valor.
      drawRightIn("P/U", xPu, COL_PU, hy, SIZE_HEADER, true, rgb(1, 1, 1));
      drawRightIn("TOTAL", xTotal, COL_TOTAL, hy, SIZE_HEADER, true, rgb(1, 1, 1));
    }
    y -= 19;
  };

  if (logo) {
    const logoW = 150;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - logoH + 4,
      width: logoW,
      height: logoH,
    });
    const dateLabel = `Fecha: ${formatInTimeZone(quote.updatedAt, TZ, "dd-MM-yyyy")}`;
    page.drawText(dateLabel, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(dateLabel, 10),
      y: y - 8,
      size: 10,
      font,
      color: muted,
    });
    y -= Math.max(logoH, 24) + 10;
  } else {
    drawText("360 STUDIO", MARGIN, 14, true);
    const dateLabel = `Fecha: ${formatInTimeZone(quote.updatedAt, TZ, "dd-MM-yyyy")}`;
    page.drawText(dateLabel, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(dateLabel, 10),
      y,
      size: 10,
      font,
      color: muted,
    });
    y -= 22;
  }

  const info = [
    ["Cliente:", clientFullName(client)],
    ["Direccion:", client.address ?? "-"],
    ["Telefono:", client.phone ?? "-"],
    ["Mail:", client.email ?? "-"],
  ];
  for (const [label, value] of info) {
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 10,
      font: fontBold,
      color: muted,
    });
    page.drawText(clipText(font, value, 10, CONTENT_W - 72), {
      x: MARGIN + 68,
      y,
      size: 10,
      font,
      color: ink,
    });
    y -= 14;
  }

  y -= 10;
  {
    const title = clipText(fontBold, quote.title, 13, CONTENT_W);
    const titleW = fontBold.widthOfTextAtSize(title, 13);
    page.drawText(title, {
      x: MARGIN + (CONTENT_W - titleW) / 2,
      y,
      size: 13,
      font: fontBold,
      color: ink,
    });
    y -= 18;
  }

  drawTableHeader();

  let item = 1;
  const renderGroups = detailed
    ? pricedGroups.map((g) => ({
        categoryName: g.categoryName,
        lines: g.lines.map((l) => ({
          id: l.id,
          name: l.name,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
        categorySubtotal: g.subtotal as number | null,
      }))
    : simpleGroups.map((g) => ({
        categoryName: g.categoryName,
        lines: g.lines.map((l) => ({
          id: l.id,
          name: l.name,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: null as number | null,
          lineTotal: null as number | null,
        })),
        categorySubtotal: null as number | null,
      }));

  for (const group of renderGroups) {
    ensureSpace(CAT_H + ROW_STEP + 4);
    page.drawRectangle({
      x: MARGIN,
      y: y - CAT_H + 2,
      width: CONTENT_W,
      height: CAT_H,
      color: categoryBg,
    });
    const catY = y - 10;
    /** Título de categoría alineado con Denominación (sin escalón vs. desgloses). */
    const catMaxW = detailed
      ? xTotal - (xName + 2) - 8
      : xQty + COL_QTY - (xName + 2) - 8;
    const catLabel = clipText(
      fontBold,
      group.categoryName.toUpperCase(),
      SIZE_BODY,
      catMaxW,
    );
    drawLeft(catLabel, xName + 2, catY, SIZE_BODY, true, ink);
    if (detailed && group.categorySubtotal != null) {
      drawRightIn(
        formatClp(group.categorySubtotal),
        xTotal,
        COL_TOTAL,
        catY,
        SIZE_BODY,
        true,
        ink,
      );
    }
    y -= CAT_H;

    for (const quoteLine of group.lines) {
      ensureSpace(ROW_STEP + 2);
      const rowY = y - 4;
      page.drawLine({
        start: { x: MARGIN, y: rowY - 7 },
        end: { x: rightEdge, y: rowY - 7 },
        thickness: 0.35,
        color: line,
      });
      drawCenterIn(String(item), xIt, COL_IT, rowY, SIZE_BODY, false, muted);
      drawLeft(
        clipText(font, quoteLine.name, SIZE_BODY, colName - 8),
        xName + 2,
        rowY,
        SIZE_BODY,
        false,
        ink,
      );
      drawCenterIn(
        shortUnit(quoteLine.unit),
        xUnit,
        COL_UNIT,
        rowY,
        SIZE_BODY,
        false,
        muted,
      );
      drawCenterIn(
        formatQty(quoteLine.quantity),
        xQty,
        COL_QTY,
        rowY,
        SIZE_BODY,
        false,
        ink,
      );
      if (
        detailed &&
        quoteLine.unitPrice != null &&
        quoteLine.lineTotal != null
      ) {
        drawRightIn(
          formatClp(quoteLine.unitPrice),
          xPu,
          COL_PU,
          rowY,
          SIZE_BODY,
          false,
          ink,
        );
        drawRightIn(
          formatClp(quoteLine.lineTotal),
          xTotal,
          COL_TOTAL,
          rowY,
          SIZE_BODY,
          true,
          ink,
        );
      }
      y -= ROW_STEP;
      item += 1;
    }
  }

  y -= 10;
  const obsLines = showObservations
    ? wrapPdfText(font, observations, 8, CONTENT_W)
    : [];
  const obsBlockH = showObservations ? 14 + obsLines.length * 11 : 0;
  const endMatterH = 58 + obsBlockH + bannerH + footerReserve + 20;
  ensureEndMatterSpace(endMatterH);

  const totalsX = MARGIN + CONTENT_W - 220;
  const totalsW = 220;
  const drawTotalRow = (
    label: string,
    value: string,
    dark = false,
    height = 16,
  ) => {
    if (dark) {
      page.drawRectangle({
        x: totalsX,
        y: y - height + 5,
        width: totalsW,
        height,
        color: headerBg,
      });
    }
    page.drawText(label, {
      x: totalsX + 8,
      y: y - 5,
      size: 8,
      font: fontBold,
      color: dark ? rgb(1, 1, 1) : muted,
    });
    page.drawText(value, {
      x: totalsX + totalsW - 8 - fontBold.widthOfTextAtSize(value, 8),
      y: y - 5,
      size: 8,
      font: fontBold,
      color: dark ? rgb(1, 1, 1) : ink,
    });
    y -= height;
  };

  drawTotalRow("SUBTOTAL NETO", formatClp(summary.subtotalNeto));
  drawTotalRow(
    `DESCUENTO ${formatPercent(summary.discountPercent)}`,
    formatClp(summary.discountAmount),
  );
  drawTotalRow("TOTAL NETO", formatClp(summary.totalNeto), true, 18);

  if (showObservations) {
    y -= 10;
    page.drawText("OBSERVACIONES:", {
      x: MARGIN,
      y,
      size: 7,
      font: fontBold,
      color: muted,
    });
    y -= 12;
    for (const obsLine of obsLines) {
      page.drawText(obsLine, {
        x: MARGIN,
        y,
        size: 8,
        font,
        color: ink,
      });
      y -= 11;
    }
  }

  y -= 12;
  // bannerH ya definido arriba; bloque comercial + pie solo al final
  const top = y;
  const bottom = y - bannerH;
  const midY = y - bannerH / 2;
  const padX = 10;
  const colW = CONTENT_W / 3;
  const x1 = MARGIN;
  const x2 = MARGIN + colW;
  const x3 = MARGIN + colW * 2;

  // Marco documental: bordes superior/inferior + separadores verticales grises
  page.drawLine({
    start: { x: MARGIN, y: top },
    end: { x: PAGE_W - MARGIN, y: top },
    thickness: 0.7,
    color: line,
  });
  page.drawLine({
    start: { x: MARGIN, y: bottom },
    end: { x: PAGE_W - MARGIN, y: bottom },
    thickness: 0.7,
    color: line,
  });
  page.drawLine({
    start: { x: x2, y: top },
    end: { x: x2, y: bottom },
    thickness: 0.6,
    color: line,
  });
  page.drawLine({
    start: { x: x3, y: top },
    end: { x: x3, y: bottom },
    thickness: 0.6,
    color: line,
  });

  const labelSize = 7;
  const bodySize = 9;
  const smallSize = 8;

  // Col 1 — Garantía
  page.drawText("GARANTIA", {
    x: x1 + padX,
    y: top - 16,
    size: labelSize,
    font: fontBold,
    color: muted,
  });
  const monthsWord = months === 1 ? "mes" : "meses";
  const monthsNum = String(months);
  page.drawText(monthsNum, {
    x: x1 + padX,
    y: top - 32,
    size: 12,
    font: fontBold,
    color: brand,
  });
  page.drawText(monthsWord, {
    x: x1 + padX + fontBold.widthOfTextAtSize(monthsNum, 12) + 4,
    y: top - 32,
    size: bodySize,
    font: fontBold,
    color: ink,
  });
  page.drawText("Por el servicio de instalacion", {
    x: x1 + padX,
    y: top - 50,
    size: smallSize,
    font,
    color: muted,
  });

  // Col 2 — Pago / vigencia
  page.drawText("FORMA DE PAGO", {
    x: x2 + padX,
    y: top - 16,
    size: labelSize,
    font: fontBold,
    color: muted,
  });
  page.drawText(pdfSafe(QUOTE_PAYMENT_METHODS), {
    x: x2 + padX,
    y: top - 28,
    size: bodySize,
    font,
    color: ink,
  });
  page.drawText("VIGENCIA DEL PRESUPUESTO", {
    x: x2 + padX,
    y: top - 46,
    size: labelSize,
    font: fontBold,
    color: muted,
  });
  const daysNum = String(QUOTE_VALIDITY_DAYS);
  page.drawText(daysNum, {
    x: x2 + padX,
    y: top - 60,
    size: bodySize,
    font: fontBold,
    color: brand,
  });
  page.drawText("dias", {
    x: x2 + padX + fontBold.widthOfTextAtSize(daysNum, bodySize) + 3,
    y: top - 60,
    size: bodySize,
    font: fontBold,
    color: ink,
  });

  // Col 3 — Cuotas
  page.drawText("FINANCIAMIENTO", {
    x: x3 + padX,
    y: top - 16,
    size: labelSize,
    font: fontBold,
    color: muted,
  });
  const cuotasLabel = String(cuotas);
  const cuotasWord = cuotas === 1 ? "cuota" : "cuotas";
  page.drawText("Hasta", {
    x: x3 + padX,
    y: top - 32,
    size: bodySize,
    font: fontBold,
    color: ink,
  });
  const hastaW = fontBold.widthOfTextAtSize("Hasta", bodySize);
  page.drawText(cuotasLabel, {
    x: x3 + padX + hastaW + 4,
    y: top - 32,
    size: 12,
    font: fontBold,
    color: brand,
  });
  page.drawText(cuotasWord, {
    x:
      x3 +
      padX +
      hastaW +
      4 +
      fontBold.widthOfTextAtSize(cuotasLabel, 12) +
      4,
    y: top - 32,
    size: bodySize,
    font: fontBold,
    color: ink,
  });
  let col3Y = top - 48;
  if (sinInteres) {
    page.drawText("Sin interes", {
      x: x3 + padX,
      y: col3Y,
      size: smallSize,
      font: fontBold,
      color: brand,
    });
    col3Y -= 14;
  }
  page.drawText("En cualquiera de nuestros productos", {
    x: x3 + padX,
    y: col3Y,
    size: smallSize,
    font,
    color: muted,
  });

  y -= bannerH + 14;
  drawFooter();

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
