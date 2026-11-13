"use client";

import { useEffect, useState } from "react";
import type { AttemptRecord } from "../../domain/interview/attempt-record";

// Resolve the exact owner-scoped baseline independently of paginated history.
export function useAttemptBaseline(id: string | undefined, records: AttemptRecord[], headers: () => Promise<Record<string, string>>) {
  const local = records.find((record) => record.id === id);
  const [remote, setRemote] = useState<{ id: string; record?: AttemptRecord; error?: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    if (!id || local) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/practice/attempts/${encodeURIComponent(id)}`, { headers: await headers(), signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || payload.record?.id !== id) throw new Error(payload.error || "Could not load the linked earlier answer.");
        if (!controller.signal.aborted) setRemote({ id, record: payload.record });
      } catch (cause) {
        if (!controller.signal.aborted) setRemote({ id, error: cause instanceof Error ? cause.message : "Could not load the linked earlier answer." });
      }
    })();
    return () => controller.abort();
  }, [id, local, headers, retryKey]);
  const current = remote?.id === id ? remote : null;
  return {
    record: local || current?.record,
    error: local ? null : current?.error,
    loading: !!id && !local && !current,
    retry() { setRemote(null); setRetryKey((key) => key + 1); },
  };
}
