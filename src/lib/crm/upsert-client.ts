import { db } from "@/lib/db";

export async function upsertClient(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}) {
  return db.upsertClient(input);
}
