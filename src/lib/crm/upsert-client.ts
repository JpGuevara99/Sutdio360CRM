import { db } from "@/lib/db";

/** Siempre crea una ficha nueva. Las coincidencias se confirman aparte. */
export async function createIndependentClient(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}) {
  return db.createClientRecord(input);
}

/** @deprecated Usar createIndependentClient. Ya no fusiona por email/teléfono. */
export async function upsertClient(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}) {
  return createIndependentClient(input);
}
