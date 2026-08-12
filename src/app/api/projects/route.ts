import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { ProjectStatus } from "@/lib/crm/types";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as ProjectStatus | null;

  const projects = await db.listProjects({
    status: status ?? undefined,
  });

  return NextResponse.json({ projects });
}
