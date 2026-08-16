import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Código requerido" }, { status: 400 });
  }

  const quote = await db.getQuoteByCode(code);
  if (!quote) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  return NextResponse.json({ quote });
}
