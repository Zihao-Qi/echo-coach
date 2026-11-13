"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttemptCursor } from "../../application/ports/attempt-repository";
import type { AttemptRecord } from "../../domain/interview/attempt-record";

export function usePracticeHistory(headers: () => Promise<Record<string, string>>) {
  const [records, setRecords] = useState<AttemptRecord[]>([]);
  const [cursor, setCursor] = useState<AttemptCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal, after?: AttemptCursor) => {
    try {
      const response = await fetch(`/api/practice/attempts${after ? `?cursor=${encodeURIComponent(JSON.stringify(after))}` : ""}`, { headers: await headers(), signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load saved attempts.");
      if (signal?.aborted) return;
      setRecords((current) => {
        const next = after ? [...current] : [];
        for (const record of payload.records as AttemptRecord[]) {
          const index = next.findIndex((item) => item.id === record.id);
          if (index >= 0) next[index] = record; else next.push(record);
        }
        return next;
      });
      setCursor(payload.cursor); setError(null);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not load history.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [headers]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  function upsert(record: AttemptRecord) {
    setRecords((current) => [...current.filter((item) => item.id !== record.id), record]);
  }
  return { records, cursor, error, loading, load, upsert };
}
