import { createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  getAdminEmails,
  getAllowedEmailDomains,
  isEmailAllowed,
} from "@/lib/env";
import {
  getAdminAuth,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import type { StaffRole } from "@/lib/crm/types";

export const SESSION_COOKIE = "studio360_session";

/** Duración de la cookie de sesión (Firebase admite hasta 14 días). */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/** Valor de cookie usado por el acceso de desarrollo (sin Firebase Admin). */
const DEV_BYPASS_TOKEN = "dev-bypass";

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string | null;
  role: StaffRole;
};

export class AuthSessionError extends Error {
  code:
    | "DOMAIN_NOT_ALLOWED"
    | "DOMAIN_NOT_CONFIGURED"
    | "INVALID_TOKEN"
    | "NOT_CONFIGURED";

  constructor(code: AuthSessionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Caché corta de sesiones verificadas. Sin ella, cada request al servidor
 * consultaba a Firebase Auth y leía el usuario en Firestore.
 */
const SESSION_CACHE_TTL_MS = 60_000;
const verifiedSessions = new Map<
  string,
  { user: SessionUser; expiresAt: number }
>();

function cacheKey(kind: "id" | "cookie", token: string): string {
  return `${kind}:${createHash("sha256").update(token).digest("hex")}`;
}

function readCachedSession(key: string): SessionUser | null {
  const hit = verifiedSessions.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    verifiedSessions.delete(key);
    return null;
  }
  return hit.user;
}

function cacheSession(key: string, user: SessionUser): SessionUser {
  verifiedSessions.set(key, {
    user,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  return user;
}

/** Olvida las sesiones verificadas (al cerrar sesión, por ejemplo). */
export function forgetCachedSessions(): void {
  verifiedSessions.clear();
}

function devSession(): SessionUser {
  return {
    uid: "dev-user",
    email: "dev@studio360.cl",
    displayName: "Dev User",
    role: "ADMIN",
  };
}

function isDevBypassAllowed(token: string): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    !isFirebaseAdminConfigured() &&
    token === DEV_BYPASS_TOKEN
  );
}

/** Rol efectivo: los correos administradores manda por sobre el guardado. */
function resolveRole(email: string, storedRole: StaffRole): StaffRole {
  return getAdminEmails().includes(email) ? "ADMIN" : storedRole;
}

async function buildSession(decoded: {
  uid: string;
  email?: string;
  name?: string;
}): Promise<SessionUser> {
  const email = decoded.email?.toLowerCase();
  if (!email) {
    throw new AuthSessionError(
      "INVALID_TOKEN",
      "La cuenta de Google no devolvió un email",
    );
  }

  // Sin lista de dominios no se deja entrar a nadie: es preferible bloquear el
  // acceso a que una variable olvidada abra el CRM a cualquier cuenta Google.
  if (getAllowedEmailDomains().length === 0) {
    throw new AuthSessionError(
      "DOMAIN_NOT_CONFIGURED",
      "Falta configurar ALLOWED_EMAIL_DOMAINS en el servidor: por seguridad no se permite ningún acceso.",
    );
  }

  if (!isEmailAllowed(email)) {
    const allowed = getAllowedEmailDomains().join(", ");
    throw new AuthSessionError(
      "DOMAIN_NOT_ALLOWED",
      `El correo ${email} no está permitido. Solo se aceptan: ${allowed}`,
    );
  }

  const staff = await db.upsertStaffUser({
    firebaseUid: decoded.uid,
    email,
    displayName: decoded.name ?? null,
  });

  return {
    uid: decoded.uid,
    email,
    displayName: staff.displayName,
    role: resolveRole(email, staff.role),
  };
}

function toAuthError(error: unknown): AuthSessionError {
  if (error instanceof AuthSessionError) return error;
  const detail = error instanceof Error ? error.message : "Token inválido";
  if (/RESOURCE_EXHAUSTED|Quota exceeded/i.test(detail)) {
    return new AuthSessionError(
      "INVALID_TOKEN",
      "Cuota de Firestore agotada (plan gratuito). Espera el reinicio diario o activa facturación en Google Cloud / Firebase.",
    );
  }
  return new AuthSessionError("INVALID_TOKEN", detail);
}

/** Verifica un ID token de Firebase (login y cabecera Authorization). */
export async function verifyIdToken(idToken: string): Promise<SessionUser> {
  if (isDevBypassAllowed(idToken)) return devSession();

  if (!isFirebaseAdminConfigured()) {
    throw new AuthSessionError(
      "NOT_CONFIGURED",
      "Firebase Admin no está configurado en el servidor",
    );
  }

  const key = cacheKey("id", idToken);
  const cached = readCachedSession(key);
  if (cached) return cached;

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    return cacheSession(key, await buildSession(decoded));
  } catch (error) {
    throw toAuthError(error);
  }
}

/**
 * Cambia un ID token por una cookie de sesión de Firebase. A diferencia del
 * ID token, se puede revocar desde el servidor (echar a alguien al instante).
 */
export async function createSessionCookieValue(
  idToken: string,
): Promise<{ value: string; user: SessionUser }> {
  const user = await verifyIdToken(idToken);
  if (isDevBypassAllowed(idToken)) {
    return { value: DEV_BYPASS_TOKEN, user };
  }

  try {
    const value = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
    return { value, user };
  } catch (error) {
    throw toAuthError(error);
  }
}

/** Verifica la cookie de sesión y comprueba que no haya sido revocada. */
export async function verifySessionCookie(
  cookieValue: string,
): Promise<SessionUser> {
  if (isDevBypassAllowed(cookieValue)) return devSession();

  if (!isFirebaseAdminConfigured()) {
    throw new AuthSessionError(
      "NOT_CONFIGURED",
      "Firebase Admin no está configurado en el servidor",
    );
  }

  const key = cacheKey("cookie", cookieValue);
  const cached = readCachedSession(key);
  if (cached) return cached;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookieValue, true);
    return cacheSession(key, await buildSession(decoded));
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function getSessionFromRequest(
  request: Request,
): Promise<SessionUser | null> {
  try {
    const header = request.headers.get("authorization");
    if (header?.startsWith("Bearer ")) {
      return await verifyIdToken(header.slice(7));
    }

    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(SESSION_COOKIE)?.value;
    if (cookieToken) {
      return await verifySessionCookie(cookieToken);
    }
  } catch {
    return null;
  }

  return null;
}
