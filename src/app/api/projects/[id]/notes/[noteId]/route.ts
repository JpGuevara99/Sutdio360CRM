import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

const updateSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await context.params;
  const existing = await db.getProjectNoteById(noteId);
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La nota no puede estar vacía" },
      { status: 400 },
    );
  }

  const note = await db.updateProjectNote(noteId, parsed.data.body);
  return NextResponse.json({ note });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await context.params;
  const existing = await db.getProjectNoteById(noteId);
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.deleteProjectNote(noteId);
  return NextResponse.json({ ok: true });
}
