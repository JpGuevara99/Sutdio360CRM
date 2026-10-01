import { db } from "@/lib/db";
import { mergeClients, pickOldestKeeper } from "@/lib/crm/merge-clients";
import type {
  Client,
  ClientMatchReason,
  ClientMatchReview,
  ClientMatchReviewWithClients,
} from "@/lib/crm/types";

export function emailMatchKey(email?: string | null): string | null {
  const value = (email ?? "").trim().toLowerCase();
  return value.includes("@") ? value : null;
}

/** Últimos 8 dígitos locales, ignora +56 y ceros de prefijo. */
export function phoneMatchKey(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  let local = digits;
  if (local.startsWith("56") && local.length >= 10) {
    local = local.slice(2);
  }
  if (local.startsWith("0") && local.length >= 9) {
    local = local.slice(1);
  }
  if (local.length < 8) return null;
  return local.slice(-8);
}

export function findSimilarClients<
  T extends {
    id: string;
    email: string | null;
    phone: string | null;
    deletedAt?: Date | null;
  },
>(
  input: { id?: string; email?: string | null; phone?: string | null },
  clients: T[],
): Array<{ client: T; reason: ClientMatchReason }> {
  const email = emailMatchKey(input.email);
  const phone = phoneMatchKey(input.phone);
  if (!email && !phone) return [];

  const results: Array<{ client: T; reason: ClientMatchReason }> = [];
  for (const client of clients) {
    if (input.id && client.id === input.id) continue;
    if (client.deletedAt) continue;
    const emailHit = Boolean(email && email === emailMatchKey(client.email));
    const phoneHit = Boolean(phone && phone === phoneMatchKey(client.phone));
    if (!emailHit && !phoneHit) continue;
    results.push({
      client,
      reason:
        emailHit && phoneHit ? "email_and_phone" : emailHit ? "email" : "phone",
    });
  }
  return results;
}

export async function queueClientMatchReviews(input: {
  client: Client;
  projectId?: string | null;
}): Promise<ClientMatchReview[]> {
  const all = await db.listClients();
  const matches = findSimilarClients(input.client, all);
  if (matches.length === 0) return [];

  const existingReviews = await db.listClientMatchReviews();
  const created: ClientMatchReview[] = [];

  for (const match of matches) {
    const duplicate = existingReviews.some(
      (review) =>
        review.status === "pending" &&
        ((review.newClientId === input.client.id &&
          review.existingClientId === match.client.id) ||
          (review.newClientId === match.client.id &&
            review.existingClientId === input.client.id)),
    );
    if (duplicate) continue;

    const review = await db.createClientMatchReview({
      newClientId: input.client.id,
      existingClientId: match.client.id,
      projectId: input.projectId ?? null,
      reason: match.reason,
    });
    created.push(review);
    existingReviews.push(review);
  }

  return created;
}

export async function listPendingClientMatchReviews(): Promise<
  ClientMatchReviewWithClients[]
> {
  const reviews = await db.listClientMatchReviews();
  const pending = reviews.filter((review) => review.status === "pending");
  const out: ClientMatchReviewWithClients[] = [];

  for (const review of pending) {
    const newClient = await db.getClientById(review.newClientId);
    const existingClient = await db.getClientById(review.existingClientId);
    if (
      !newClient ||
      newClient.deletedAt ||
      !existingClient ||
      existingClient.deletedAt
    ) {
      continue;
    }
    out.push({ ...review, newClient, existingClient });
  }

  return out;
}

export async function resolveClientMatchReview(
  id: string,
  action: "merge" | "independent",
): Promise<ClientMatchReview> {
  const review = await db.getClientMatchReviewById(id);
  if (!review) {
    throw new Error("Revisión no encontrada");
  }
  if (review.status !== "pending") {
    throw new Error("Esta coincidencia ya fue resuelta");
  }

  if (action === "independent") {
    return db.updateClientMatchReview(id, {
      status: "kept_independent",
      resolvedAt: new Date(),
    });
  }

  const newClient = await db.getClientById(review.newClientId);
  const existingClient = await db.getClientById(review.existingClientId);
  if (
    !newClient ||
    newClient.deletedAt ||
    !existingClient ||
    existingClient.deletedAt
  ) {
    return db.updateClientMatchReview(id, {
      status: "kept_independent",
      resolvedAt: new Date(),
    });
  }

  const keeper = pickOldestKeeper([newClient, existingClient]);
  const absorbed =
    keeper.id === newClient.id ? existingClient : newClient;
  await mergeClients({
    keeperId: keeper.id,
    mergeIds: [absorbed.id],
  });

  const now = new Date();
  const all = await db.listClientMatchReviews();
  for (const other of all) {
    if (other.status !== "pending") continue;
    if (other.id === id) {
      await db.updateClientMatchReview(other.id, {
        status: "merged",
        resolvedAt: now,
      });
      continue;
    }
    if (
      other.newClientId === absorbed.id ||
      other.existingClientId === absorbed.id
    ) {
      await db.updateClientMatchReview(other.id, {
        status: "kept_independent",
        resolvedAt: now,
      });
    }
  }

  const updated = await db.getClientMatchReviewById(id);
  if (!updated) {
    throw new Error("Revisión no encontrada después de combinar");
  }
  return updated;
}
