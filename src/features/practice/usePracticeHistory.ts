"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptCursor } from "../../application/ports/attempt-repository";
import type { AttemptRecord } from "../../domain/interview/attempt-record";

import { localHistory, historyNotice } from "./key/history";

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

export function usePracticeHistory(headers: () => Promise<Record<string, string>>, onEmpty: () => void, keyMode = false) {
  const [page, setPage] = useState<LoadedHistory>({ records: [], cursor: null, loadedOlder: false });
  // All writes update this snapshot before publishing to React, even when renders are batched.
  const currentPage = useRef(page);
  const publish = useCallback((next: LoadedHistory) => {
    currentPage.current = next;
    setPage(next);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const invalidateRequests = useCallback(() => ++revision.current, []);
  const load = useCallback(async (signal?: AbortSignal, after?: AttemptCursor, preserveOlder = false) => {
    const request = invalidateRequests();
    const current = () => request === revision.current && !signal?.aborted;
    try {
      if (keyMode) {
        publish({ records: localHistory().map(a => ({ ...a, status: "completed" })), cursor: null, loadedOlder: false });
        setError(historyNotice() || null);
        return;
      }
      const response = await fetch(`/api/practice/attempts${after ? `?cursor=${encodeURIComponent(JSON.stringify(after))}` : ""}`, { headers: await headers(), signal });
      const payload = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(payload.error || "Could not load saved attempts.");
      const records: AttemptRecord[] = payload.records;
      const cursor: AttemptCursor | null = payload.cursor;
      const previous = currentPage.current;
      if (after) {
        publish({ records: merge(previous.records, records), cursor, loadedOlder: true });
      } else if (preserveOlder && previous.loadedOlder && records.length && cursor) {
        // An upserted record near the head doesn't prove the fresh page reaches the loaded range.
        const connected = previous.records.some(record => record.id === cursor.id);
        publish({ records: merge(previous.records, records), cursor: connected ? previous.cursor : cursor, loadedOlder: true });
      } else {
        publish({ records, cursor, loadedOlder: false });
        if (previous.records.length && !records.length) onEmpty();
      }
      setError(null);
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Could not load history.");
    } finally { if (current()) setLoading(false); }
  }, [headers, onEmpty, invalidateRequests, publish, keyMode]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); invalidateRequests(); };
  }, [load, invalidateRequests]);
  function upsert(record: AttemptRecord) {
    invalidateRequests();
    const previous = currentPage.current;
    publish({ ...previous, records: merge(previous.records, [record]) });
  }
  return { records: page.records, cursor: page.cursor, error, loading, load, upsert };
}
