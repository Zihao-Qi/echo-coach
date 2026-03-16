import { Recap, SessionHistoryItem, SessionRecapPayload } from "../types/coach";

function getRecapStorageKey(sessionId: string) {
  return `echo-coach:recap:${sessionId}`;
}

function normalizeSnapshot(raw: Recap | SessionRecapPayload): SessionRecapPayload {
  if ("recap" in raw) {
    return raw;
  }

  return {
    recap: raw,
    coachingHistory: [],
  };
}

export function saveRecapSnapshot(snapshot: Recap | SessionRecapPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const normalizedSnapshot = normalizeSnapshot(snapshot);
    window.localStorage.setItem(
      getRecapStorageKey(normalizedSnapshot.recap.sessionId),
      JSON.stringify(normalizedSnapshot)
    );
  } catch (error) {
    console.error("Save recap snapshot failed:", error);
  }
}

export function loadRecapSnapshot(sessionId: string): SessionRecapPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getRecapStorageKey(sessionId));
    if (!raw) {
      return null;
    }

    return normalizeSnapshot(JSON.parse(raw) as Recap | SessionRecapPayload);
  } catch (error) {
    console.error("Load recap snapshot failed:", error);
    return null;
  }
}

function extractTimestamp(sessionId: string) {
  const match = sessionId.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function listRecapSnapshotHistory(): SessionHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const items: SessionHistoryItem[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith("echo-coach:recap:")) {
        continue;
      }

      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      const snapshot = normalizeSnapshot(JSON.parse(raw) as Recap | SessionRecapPayload);
      const recap = snapshot.recap;
      items.push({
        sessionId: recap.sessionId,
        scenario: "interview",
        startedAt: new Date(extractTimestamp(recap.sessionId)).toISOString(),
        updatedAt: new Date(extractTimestamp(recap.sessionId)).toISOString(),
        primaryFocus: recap.primaryFocus,
        polishedAnswerPreview: recap.polishedAnswer,
      });
    }
  } catch (error) {
    console.error("List recap snapshot history failed:", error);
  }

  return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
