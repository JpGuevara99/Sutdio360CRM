import { db } from "@/lib/db";
import type { Quote, QuoteCosts } from "@/lib/crm/types";
import { quoteCostsFromLines } from "@/lib/crm/quote-summary";

const ZERO_COSTS: QuoteCosts = { labor: 0, logistics: 0, materials: 0 };

/**
 * Costos por cotización usando el dato guardado en cada documento. Solo lee
 * líneas de las cotizaciones antiguas que todavía no lo tienen, y aprovecha
 * para guardárselo, de modo que la siguiente vez cueste cero lecturas.
 */
export async function resolveQuoteCosts(
  quotes: Quote[],
): Promise<Map<string, QuoteCosts>> {
  const costsByQuote = new Map<string, QuoteCosts>();
  const pending: string[] = [];

  for (const quote of quotes) {
    if (quote.costs) costsByQuote.set(quote.id, quote.costs);
    else pending.push(quote.id);
  }

  if (pending.length === 0) return costsByQuote;

  const lines = await db.listQuoteLinesByQuoteIds(pending);
  const linesByQuote = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = linesByQuote.get(line.quoteId) ?? [];
    list.push(line);
    linesByQuote.set(line.quoteId, list);
  }

  for (const quoteId of pending) {
    costsByQuote.set(
      quoteId,
      quoteCostsFromLines(linesByQuote.get(quoteId) ?? []),
    );
  }

  await Promise.allSettled(
    pending.map((quoteId) =>
      db.setQuoteCosts(quoteId, costsByQuote.get(quoteId) ?? ZERO_COSTS),
    ),
  );

  return costsByQuote;
}
