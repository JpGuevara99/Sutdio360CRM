import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import {
  CotizadorIndexClient,
  type CotizadorProjectOption,
  type CotizadorQuoteRow,
} from "@/components/crm/CotizadorIndexClient";
import { clientFullName } from "@/lib/crm/labels";
import { buildQuoteTotals, percentsFromQuote } from "@/lib/crm/quote-summary";
import { resolveQuoteCosts } from "@/lib/crm/quote-costs";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { db } from "@/lib/db";

export default async function CotizadorIndexPage() {
  await requirePageSession();

  const [quotes, projects, company] = await Promise.all([
    db.listRecentQuotes(80),
    db.listProjects(),
    db.getCompanySettings(),
  ]);

  // Los costos van guardados en cada cotización, así que los totales no
  // requieren leer líneas.
  const costsByQuote = await resolveQuoteCosts(quotes);

  const quotesWithTotals: CotizadorQuoteRow[] = quotes.map((quote) => {
    const totals = buildQuoteTotals(
      costsByQuote.get(quote.id) ?? { labor: 0, logistics: 0, materials: 0 },
      percentsFromQuote(quote),
    );
    return {
      ...quote,
      totalNeto: totals.totalNeto,
      includeIva: totals.includeIva,
      totalConIva: totals.totalConIva,
    };
  });

  const projectOptions: CotizadorProjectOption[] = projects.map((p) => ({
    id: p.id,
    publicCode: p.publicCode,
    title: p.title,
    clientName: clientFullName(p.client),
    address: p.client.address,
  }));

  return (
    <>
      <TopBar title="Cotizador" />
      <PageBody fill>
        <CotizadorIndexClient
          quotes={quotesWithTotals}
          projects={projectOptions}
          initialCompanySettings={{
            commercialAddress: company.commercialAddress,
            phone: company.phone,
          }}
        />
      </PageBody>
    </>
  );
}
