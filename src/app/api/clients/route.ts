import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await db.listClients();
  return NextResponse.json({ clients });
}
