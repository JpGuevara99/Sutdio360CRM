import { notFound } from "next/navigation";
import { TopBar } from "@/components/crm/TopBar";
import { PageBody } from "@/components/crm/PageBody";
import { QuoteBuilder } from "@/components/crm/QuoteBuilder";
import { formatEntityCode } from "@/lib/crm/project-codes";
import { db } from "@/lib/db";

export default async function QuoteEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; quoteId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id, quoteId } = await params;
  const { from } = await searchParams;
  const entryFrom = from === "cotizador" ? "cotizador" : "proyecto";

  const [project, quote, materials, categories] = await Promise.all([
    db.getProjectById(id),
    db.getQuoteById(quoteId),
    db.listMaterials(),
    db.listMaterialCategories(),
  ]);

  if (!project) notFound();
  if (!quote || quote.projectId !== id) notFound();

  return (
    <>
      <TopBar title={`Cotizador ${formatEntityCode(project.publicCode)}`} />
      <PageBody>
        <QuoteBuilder
          project={project}
          client={project.client}
          initialQuote={quote}
          materials={materials}
          categories={categories}
          entryFrom={entryFrom}
        />
      </PageBody>
    </>
  );
}
