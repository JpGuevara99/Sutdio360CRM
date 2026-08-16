import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  type SessionUser,
} from "@/lib/auth/session";

type Guarded =
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Sesión obligatoria para un endpoint. Con `admin: true` además exige rol
 * ADMIN, que es lo que pedimos para acciones irreversibles y ajustes globales.
 *
 *   const auth = await requireApiSession(request, { admin: true });
 *   if (!auth.ok) return auth.response;
 */
export async function requireApiSession(
  request: Request,
  options?: { admin?: boolean },
): Promise<Guarded> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (options?.admin && session.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Esta acción requiere permisos de administrador. Pide que agreguen tu correo a ADMIN_EMAILS.",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, session };
}
