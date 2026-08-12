export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL,
  );
}

export function getGoogleAuth(scopes: string[]) {
  if (!isGoogleConfigured()) {
    throw new Error("Google service account env vars are not configured");
  }

  // Import diferido para que isGoogleConfigured sea usable sin cargar googleapis
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require("googleapis") as typeof import("googleapis");
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(
    /\\n/g,
    "\n",
  );

  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes,
    subject: process.env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL,
  });
}

export function getCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

export function getDriveRootFolderId(): string | undefined {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || undefined;
}
