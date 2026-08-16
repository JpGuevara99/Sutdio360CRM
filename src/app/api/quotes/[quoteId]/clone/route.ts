import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  buildQuoteCode,
  formatQuoteCodeLabel,
  nextQuoteSequence,
} from "@/lib/crm/quote-codes";
import { db } from "@/lib/db";

const bodySchema = z.object({
  projectId: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quoteId } = await context.params;
  const source = await db.getQuoteById(quoteId);
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const json = (await request.json()) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    parsedBody = parsed.data;
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const targetProject = await db.getProjectById(parsedBody.projectId);
  if (!targetProject) {
    return NextResponse.json(
      { error: "Proyecto destino no encontrado" },
      { status: 404 },
    );
  }

  const existing = await db.listQuotesByProject(targetProject.id);
  const sequence = nextQuoteSequence(
    existing.map((q) => q.quoteCode),
    targetProject.publicCode,
  );
  const quoteCode = buildQuoteCode(targetProject.publicCode, sequence);

  const quote = await db.cloneQuoteToProject({
    sourceQuoteId: quoteId,
    targetProjectId: targetProject.id,
    quoteCode,
    title: formatQuoteCodeLabel(quoteCode),
  });

  return NextResponse.json({ quote }, { status: 201 });
}
