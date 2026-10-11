"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientMatchReviewModal } from "@/components/crm/ClientMatchReviewModal";
import type { ClientMatchReviewWithClients } from "@/lib/crm/types";

export const CLIENT_MATCH_EVENT = "studio360:client-matches";

export function notifyClientMatchReviews() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLIENT_MATCH_EVENT));
}

export function ClientMatchReviewHost() {
  const router = useRouter();
  const [reviews, setReviews] = useState<ClientMatchReviewWithClients[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/clients/match-reviews");
      if (!res.ok) return;
      const data = (await res.json()) as {
        reviews?: ClientMatchReviewWithClients[];
      };
      setReviews(data.reviews ?? []);
    } catch {
      /* ignore polling errors */
    }
  }, []);

  useEffect(() => {
    // Fetch once when the shared CRM host mounts; refreshes then follow app events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onEvent = () => {
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(CLIENT_MATCH_EVENT, onEvent);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener(CLIENT_MATCH_EVENT, onEvent);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const visible = reviews.filter((review) => !skipped.has(review.id));
  const current = visible[0] ?? null;

  async function resolve(action: "merge" | "independent") {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/match-reviews/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar la decisión");
        return;
      }
      setReviews((prev) => prev.filter((review) => review.id !== current.id));
      router.refresh();
    } catch {
      setError("No se pudo guardar la decisión");
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <ClientMatchReviewModal
      newClient={current.newClient}
      existingClient={current.existingClient}
      reason={current.reason}
      remaining={visible.length}
      busy={busy}
      error={error}
      onMerge={() => void resolve("merge")}
      onIndependent={() => void resolve("independent")}
      onLater={() => {
        setSkipped((prev) => new Set(prev).add(current.id));
        setError(null);
      }}
    />
  );
}
