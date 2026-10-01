import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-session";
import { listPendingClientMatchReviews } from "@/lib/crm/client-match";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const reviews = await listPendingClientMatchReviews();
  return NextResponse.json({ reviews });
}
