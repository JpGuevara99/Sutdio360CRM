import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { retryPendingDriveFolders } from "@/lib/crm/drive-sync";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  const session = await getSessionFromRequest(request);

  if (!(session || (cronSecret && header === cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await retryPendingDriveFolders();
  return NextResponse.json({
    ok: true,
    retried: projects.length,
    pending: projects.filter((p) => p?.driveSyncPending).length,
  });
}
