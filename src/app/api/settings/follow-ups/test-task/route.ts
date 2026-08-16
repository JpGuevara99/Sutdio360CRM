import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { checkGoogleTasks } from "@/lib/google/tasks";

/** Crea y borra una tarea de prueba para validar Google Tasks. */
export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const keepTask = url.searchParams.get("keep") === "1";
  const check = await checkGoogleTasks({ keepTask });

  return NextResponse.json(check, { status: check.ok ? 200 : 502 });
}
