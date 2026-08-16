import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidCronSecret } from "@/lib/auth/cron-secret";
import { retryPendingDriveFolders } from "@/lib/crm/drive-sync";
import { formatGoogleAuthError } from "@/lib/google/auth";

export async function POST(request: Request) {
  const fromCron = isValidCronSecret(request.headers.get("x-cron-secret"));
  const session = fromCron ? null : await getSessionFromRequest(request);

  if (!fromCron && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { results, errors, clientsEnsured } = await retryPendingDriveFolders();
    const pending = results.filter(
      (p) => p?.driveSyncPending || !p?.driveFolderId,
    ).length;
    return NextResponse.json(
      {
        ok: errors.length === 0,
        retried: results.length,
        clientsEnsured,
        pending,
        error: errors[0] ?? undefined,
        errors,
      },
      { status: errors.length && pending === results.length ? 502 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: formatGoogleAuthError(error), ok: false },
      { status: 500 },
    );
  }
}
