import { notFound } from "next/navigation";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { QuotePrintView } from "@/components/crm/QuotePrintView";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { parseQuoteVariant } from "@/lib/crm/quote-priced-lines";
import { db } from "@/lib/db";

export default async function QuotePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; quoteId: string }>;
  searchParams: Promise<{ from?: string; variant?: string }>;
}) {
  const { id, quoteId } = await params;
  const { from, variant: variantParam } = await searchParams;
  const entryFrom = from === "cotizador" ? "cotizador" : "proyecto";
  const variant = parseQuoteVariant(variantParam);

  const [project, quote, company] = await Promise.all([
    db.getProjectById(id),
    db.getQuoteById(quoteId),
    db.getCompanySettings(),
  ]);

  if (!project) notFound();
  if (!quote || quote.projectId !== id) notFound();

  const variantLabel =
    variant === "detailed" ? "Detallado" : "Sin detalles";

  return (
    <>
      <TopBar
        title={`Vista previa · ${formatEntityCode(project.publicCode)} · ${variantLabel}`}
      />
      <PageBody className="print:p-0">
        <QuotePrintView
          quote={quote}
          project={project}
          client={project.client}
          companySettings={{
            commercialAddress: company.commercialAddress,
            phone: company.phone,
          }}
          entryFrom={entryFrom}
          variant={variant}
        />
      </PageBody>
    </>
  );
}
