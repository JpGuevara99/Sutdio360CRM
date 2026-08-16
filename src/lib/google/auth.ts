import { createPrivateKey } from "node:crypto";
import { normalizePemPrivateKey, readEnv } from "@/lib/env";

export function isGoogleConfigured(): boolean {
  return Boolean(
    readEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
      readEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") &&
      readEnv("GOOGLE_WORKSPACE_IMPERSONATE_EMAIL"),
  );
}

export function formatGoogleAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const blob = message.toLowerCase();
  if (
    blob.includes("decoder routines") ||
    blob.includes("err_ossl") ||
    (blob.includes("unsupported") && blob.includes("routines"))
  ) {
    return [
      "Google no pudo leer la clave privada (error de decoder/PEM).",
      "En Vercel, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY hay que pegarla sin comillas extra.",
      "Debe empezar por -----BEGIN PRIVATE KEY----- y terminar en -----END PRIVATE KEY-----.",
    ].join(" ");
  }
  if (blob.includes("unauthorized_client")) {
    return [
      "Google rechazó la cuenta de servicio (unauthorized_client).",
      "Revisa la delegación de dominio en Workspace y que Calendar/Drive/Tasks estén autorizados.",
    ].join(" ");
  }
  return message;
}

function getGooglePrivateKey(): string {
  const key = normalizePemPrivateKey(
    readEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
  );
  if (!key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no está configurada");
  }
  try {
    createPrivateKey(key);
  } catch (error) {
    throw new Error(formatGoogleAuthError(error));
  }
  return key;
}

export function getGoogleAuth(scopes: string[]) {
  if (!isGoogleConfigured()) {
    throw new Error("Google service account env vars are not configured");
  }

  // Import diferido para que isGoogleConfigured sea usable sin cargar googleapis
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require("googleapis") as typeof import("googleapis");

  return new google.auth.JWT({
    email: readEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: getGooglePrivateKey(),
    scopes,
    subject: readEnv("GOOGLE_WORKSPACE_IMPERSONATE_EMAIL"),
  });
}

export function getCalendarId(): string {
  return readEnv("GOOGLE_CALENDAR_ID") || "primary";
}

export function getDriveRootFolderId(): string | undefined {
  return readEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID") || undefined;
}
