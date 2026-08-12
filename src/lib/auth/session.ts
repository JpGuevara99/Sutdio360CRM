import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getAllowedEmailDomains, isEmailAllowed } from "@/lib/env";
import {
  getAdminAuth,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import type { StaffRole } from "@/lib/crm/types";

export const SESSION_COOKIE = "studio360_session";

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string | null;
  role: StaffRole;
};

export class AuthSessionError extends Error {
  code: "DOMAIN_NOT_ALLOWED" | "INVALID_TOKEN" | "NOT_CONFIGURED";

  constructor(
    code: AuthSessionError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export async function verifyIdToken(
  idToken: string,
): Promise<SessionUser> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "development" && idToken === "dev-bypass") {
      return {
        uid: "dev-user",
        email: "dev@studio360.cl",
        displayName: "Dev User",
        role: "ADMIN",
      };
    }
    throw new AuthSessionError(
      "NOT_CONFIGURED",
      "Firebase Admin no está configurado en el servidor",
    );
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    if (!email) {
      throw new AuthSessionError(
        "INVALID_TOKEN",
        "La cuenta de Google no devolvió un email",
      );
    }

    if (!isEmailAllowed(email)) {
      const allowed = getAllowedEmailDomains().join(", ");
      throw new AuthSessionError(
        "DOMAIN_NOT_ALLOWED",
        `El correo ${email} no está permitido. Solo se aceptan: ${allowed || "(ninguno configurado)"}`,
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
      role: staff.role,
    };
  } catch (error) {
    if (error instanceof AuthSessionError) throw error;
    const detail =
      error instanceof Error ? error.message : "Token inválido";
    if (/RESOURCE_EXHAUSTED|Quota exceeded/i.test(detail)) {
      throw new AuthSessionError(
        "INVALID_TOKEN",
        "Cuota de Firestore agotada (plan gratuito). Espera el reinicio diario o activa facturación en Google Cloud / Firebase. Mientras tanto puedes usar modo desarrollo si Admin no está configurado.",
      );
    }
    throw new AuthSessionError("INVALID_TOKEN", detail);
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
      return await verifyIdToken(cookieToken);
    }
  } catch {
    return null;
  }

  return null;
}
