import { db } from "@/lib/db";
import type { AuditAction } from "@/lib/crm/types";

/**
 * Deja constancia de una acción sensible. Nunca lanza: si el registro falla,
 * la acción del usuario no debe romperse por eso.
 */
export async function recordAudit(input: {
  action: AuditAction;
  actorEmail: string;
  target?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await db.createAuditLog(input);
  } catch (error) {
    console.error("recordAudit failed", input.action, error);
  }
}
