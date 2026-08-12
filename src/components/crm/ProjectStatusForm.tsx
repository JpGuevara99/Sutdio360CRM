"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectStatus } from "@/lib/crm/types";
import { PROJECT_STATUS_LABELS } from "@/lib/crm/labels";

const STATUSES = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];

export function ProjectStatusForm({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function onChange(next: ProjectStatus) {
    setValue(next);
    setSaving(true);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">Estado</span>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => void onChange(e.target.value as ProjectStatus)}
        className="rounded border border-border px-3 py-2 outline-none focus:border-[#1a73e8]"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {PROJECT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
