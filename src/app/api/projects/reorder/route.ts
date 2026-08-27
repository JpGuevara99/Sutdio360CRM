import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { statusForStage } from "@/lib/crm/pipeline";
import { db } from "@/lib/db";

const reorderSchema = z.object({
  stageId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = reorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Orden inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { stageId, orderedIds } = parsed.data;
  const stage = (await db.listPipelineStages()).find((s) => s.id === stageId);
  if (!stage) {
    return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
  }

  try {
    const nextStatus = statusForStage(stage);
    await db.reorderProjectsInStage(stageId, orderedIds, nextStatus ?? undefined);
    revalidatePath("/proyectos");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/projects/reorder failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo reordenar los proyectos",
      },
      { status: 500 },
    );
  }
}
