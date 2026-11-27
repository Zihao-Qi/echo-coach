"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptCursor } from "../../application/ports/attempt-repository";
import type { AttemptRecord } from "../../domain/interview/attempt-record";

interface LoadedHistory {
  records: AttemptRecord[];
  cursor: AttemptCursor | null;
  loadedOlder: boolean;
}

function merge(current: AttemptRecord[], fresh: AttemptRecord[]) {
  const byId = new Map(current.map(record => [record.id, record]));
  for (const record of fresh) byId.set(record.id, record);
  return [...byId.values()];
}

export function usePracticeHistory(headers: () => Promise<Record<string, string>>, onEmpty: () => void) {
  const [page, setPage] = useState<LoadedHistory>({ records: [], cursor: null, loadedOlder: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const invalidateRequests = useCallback(() => ++revision.current, []);
  const load = useCallback(async (signal?: AbortSignal, after?: AttemptCursor, preserveOlder = false) => {
    const request = invalidateRequests();
    const current = () => request === revision.current && !signal?.aborted;
    try {
      const response = await fetch(`/api/practice/attempts${after ? `?cursor=${encodeURIComponent(JSON.stringify(after))}` : ""}`, { headers: await headers(), signal });
      const payload = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(payload.error || "Could not load saved attempts.");
      const records: AttemptRecord[] = payload.records;
      const cursor: AttemptCursor | null = payload.cursor;
      if (!after && !records.length) onEmpty();
      setPage(previous => {
        if (after) return { records: merge(previous.records, records), cursor, loadedOlder: true };
        if (preserveOlder && previous.loadedOlder && records.length && cursor) {
          // Keep the deepest cursor when pages overlap; otherwise load the intervening page next.
          const overlap = records.some(record => previous.records.some(old => old.id === record.id));
          return { records: merge(previous.records, records), cursor: overlap ? previous.cursor : cursor, loadedOlder: true };
        }
        return { records, cursor, loadedOlder: false };
      });
      setError(null);
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Could not load history.");
    } finally { if (current()) setLoading(false); }
  }, [headers, onEmpty, invalidateRequests]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); invalidateRequests(); };
  }, [load, invalidateRequests]);
  function upsert(record: AttemptRecord) {
    invalidateRequests();
    setPage(previous => ({ ...previous, records: merge(previous.records, [record]) }));
  }
  return { records: page.records, cursor: page.cursor, error, loading, load, upsert };
}
