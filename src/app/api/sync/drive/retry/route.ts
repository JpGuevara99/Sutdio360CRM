import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidCronSecret } from "@/lib/auth/cron-secret";
import { retryPendingDriveFolders } from "@/lib/crm/drive-sync";

export async function POST(request: Request) {
  const fromCron = isValidCronSecret(request.headers.get("x-cron-secret"));
  const session = fromCron ? null : await getSessionFromRequest(request);

  if (!fromCron && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await retryPendingDriveFolders();
  return NextResponse.json({
    ok: true,
    retried: projects.length,
    pending: projects.filter((p) => p?.driveSyncPending).length,
  });
}
