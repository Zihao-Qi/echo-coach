import { GoogleAuth } from "google-auth-library";
import { CoachingTurn, LiveSession, Recap, SessionHistoryItem } from "../../types/coach";
import { DEFAULT_LANGUAGE, resolveMockMode } from "./coach-server";

interface PersistedSessionRecord {
  sessionId: string;
  scenario: LiveSession["scenario"];
  language: typeof DEFAULT_LANGUAGE;
  openingQuestion: string;
  startedAt: string;
  status: LiveSession["status"];
  hasRecap: boolean;
  primaryFocus?: string;
  polishedAnswerPreview?: string;
  createdAt: string;
  updatedAt: string;
}

interface PersistedCoachingTurnRecord extends CoachingTurn {
  transcriptSource: "mock" | "chirp_3" | "fallback";
}

interface PersistedRecapRecord extends Recap {
  savedAt: string;
}

type FirestorePrimitive =
  | string
  | number
  | boolean
  | null
  | FirestorePrimitive[]
  | { [key: string]: FirestorePrimitive | undefined };

interface MockSessionStore {
  sessions: Map<string, PersistedSessionRecord>;
  coachingTurns: Map<string, PersistedCoachingTurnRecord[]>;
  recaps: Map<string, PersistedRecapRecord>;
}

declare global {
  var __echoCoachMockSessionStore: MockSessionStore | undefined;
}

const MAX_RECAP_ASSET_LENGTH = 800_000;

function getMockStore(): MockSessionStore {
  if (!globalThis.__echoCoachMockSessionStore) {
    globalThis.__echoCoachMockSessionStore = {
      sessions: new Map(),
      coachingTurns: new Map(),
      recaps: new Map(),
    };
  }

  return globalThis.__echoCoachMockSessionStore;
}

function shouldUseMockStore() {
  return resolveMockMode() || !process.env.GOOGLE_CLOUD_PROJECT;
}

function getProjectId() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required for Firestore persistence.");
  }
  return projectId;
}

async function getFirestoreAccessToken() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error("Google Cloud access token is unavailable for Firestore.");
  }
  return token;
}

function encodeDocumentPath(...segments: string[]) {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function toFirestoreValue(value: FirestorePrimitive): Record<string, unknown> {
  if (value === null) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }

  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "boolean":
      return { booleanValue: value };
    case "number":
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    case "object": {
      const fields = Object.fromEntries(
        Object.entries(value)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [key, toFirestoreValue(entry as FirestorePrimitive)])
      );

      return { mapValue: { fields } };
    }
    default:
      throw new Error(`Unsupported Firestore value type: ${typeof value}`);
  }
}

function fromFirestoreValue(
  value: Record<string, unknown> | undefined
): FirestorePrimitive | undefined {
  if (!value) {
    return undefined;
  }

  if ("stringValue" in value) {
    return value.stringValue as string;
  }

  if ("booleanValue" in value) {
    return value.booleanValue as boolean;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue as string);
  }

  if ("doubleValue" in value) {
    return value.doubleValue as number;
  }

  if ("nullValue" in value) {
    return null;
  }

  if ("arrayValue" in value) {
    const values =
      (value.arrayValue as { values?: Array<Record<string, unknown>> }).values || [];
    return values
      .map((item) => fromFirestoreValue(item))
      .filter((item): item is FirestorePrimitive => item !== undefined);
  }

  if ("mapValue" in value) {
    const fields =
      (value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields || {};

    return Object.fromEntries(
      Object.entries(fields).map(([key, fieldValue]) => [key, fromFirestoreValue(fieldValue)])
    );
  }

  return undefined;
}

async function writeFirestoreDocument(path: string, data: Record<string, FirestorePrimitive>) {
  const projectId = getProjectId();
  const token = await getFirestoreAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(data)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, toFirestoreValue(value)])
        ),
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Firestore write failed with ${response.status}: ${message}`);
  }
}

async function readFirestoreDocument<T>(path: string): Promise<T | null> {
  const projectId = getProjectId();
  const token = await getFirestoreAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": projectId,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Firestore read failed with ${response.status}: ${message}`);
  }

  const payload = (await response.json()) as {
    fields?: Record<string, Record<string, unknown>>;
  };

  const fields = payload.fields || {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, fieldValue]) => [key, fromFirestoreValue(fieldValue)])
  ) as T;
}

async function listFirestoreDocuments<T>(
  collectionId: string,
  limit: number,
  orderBy = "updatedAt desc"
): Promise<T[]> {
  const projectId = getProjectId();
  const token = await getFirestoreAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=${limit}&orderBy=${encodeURIComponent(orderBy)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": projectId,
      },
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Firestore list failed with ${response.status}: ${message}`);
  }

  const payload = (await response.json()) as {
    documents?: Array<{ fields?: Record<string, Record<string, unknown>> }>;
  };

  return (payload.documents || []).map((document) => {
    const fields = document.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, fieldValue]) => [key, fromFirestoreValue(fieldValue)])
    ) as T;
  });
}

function sanitizeRecapForPersistence(recap: Recap): PersistedRecapRecord {
  const assetDataUrl =
    recap.assetDataUrl && recap.assetDataUrl.length <= MAX_RECAP_ASSET_LENGTH
      ? recap.assetDataUrl
      : undefined;

  return {
    ...recap,
    assetDataUrl,
    savedAt: new Date().toISOString(),
  };
}

function buildSessionDocument(session: LiveSession, language: typeof DEFAULT_LANGUAGE) {
  const now = new Date().toISOString();
  return {
    sessionId: session.sessionId,
    scenario: session.scenario,
    language,
    openingQuestion: session.openingQuestion,
    startedAt: session.startedAt,
    status: session.status,
    hasRecap: false,
    createdAt: now,
    updatedAt: now,
  } satisfies PersistedSessionRecord;
}

function buildCoachingTurnDocument(
  coachingTurn: CoachingTurn,
  transcriptSource: PersistedCoachingTurnRecord["transcriptSource"]
) {
  return {
    ...coachingTurn,
    transcriptSource,
  } satisfies PersistedCoachingTurnRecord;
}

export async function persistSessionRecord(
  session: LiveSession,
  language: typeof DEFAULT_LANGUAGE
) {
  const record = buildSessionDocument(session, language);
  const firestoreRecord: Record<string, FirestorePrimitive> = { ...record };

  if (shouldUseMockStore()) {
    getMockStore().sessions.set(session.sessionId, record);
    return;
  }

  await writeFirestoreDocument(
    encodeDocumentPath("sessions", session.sessionId),
    firestoreRecord
  );
}

export async function persistCoachingTurnRecord(
  coachingTurn: CoachingTurn,
  transcriptSource: PersistedCoachingTurnRecord["transcriptSource"]
) {
  const record = buildCoachingTurnDocument(coachingTurn, transcriptSource);
  const turnId = coachingTurn.timestamp.replace(/[^a-zA-Z0-9_-]/g, "-");
  const firestoreRecord: Record<string, FirestorePrimitive> = { ...record };

  if (shouldUseMockStore()) {
    const store = getMockStore();
    const existingTurns = store.coachingTurns.get(coachingTurn.sessionId) || [];
    store.coachingTurns.set(coachingTurn.sessionId, [...existingTurns, record]);
    return;
  }

  await writeFirestoreDocument(
    encodeDocumentPath("sessions", coachingTurn.sessionId, "coachingTurns", turnId),
    firestoreRecord
  );
}

export async function persistRecapRecord(recap: Recap) {
  const record = sanitizeRecapForPersistence(recap);
  const firestoreRecord: Record<string, FirestorePrimitive> = { ...record };
  const sessionSummaryRecord: Record<string, FirestorePrimitive> = {
    sessionId: recap.sessionId,
    hasRecap: true,
    primaryFocus: recap.primaryFocus,
    polishedAnswerPreview: recap.polishedAnswer.slice(0, 180),
    updatedAt: record.savedAt,
  };

  if (shouldUseMockStore()) {
    const store = getMockStore();
    const sessionRecord = store.sessions.get(recap.sessionId);
    if (sessionRecord) {
      store.sessions.set(recap.sessionId, {
        ...sessionRecord,
        hasRecap: true,
        primaryFocus: recap.primaryFocus,
        polishedAnswerPreview: recap.polishedAnswer.slice(0, 180),
        updatedAt: record.savedAt,
      });
    }
    store.recaps.set(recap.sessionId, record);
    return;
  }

  await writeFirestoreDocument(
    encodeDocumentPath("sessions", recap.sessionId, "recap", "current"),
    firestoreRecord
  );
  await writeFirestoreDocument(
    encodeDocumentPath("sessions", recap.sessionId),
    sessionSummaryRecord
  );
}

export async function loadRecapRecord(sessionId: string): Promise<Recap | null> {
  if (shouldUseMockStore()) {
    return getMockStore().recaps.get(sessionId) || null;
  }

  return readFirestoreDocument<Recap>(
    encodeDocumentPath("sessions", sessionId, "recap", "current")
  );
}

export async function loadCoachingTurnRecords(
  sessionId: string
): Promise<CoachingTurn[]> {
  if (shouldUseMockStore()) {
    return (getMockStore().coachingTurns.get(sessionId) || []).sort(
      (left, right) => left.questionIndex - right.questionIndex
    );
  }

  const records = await listFirestoreDocuments<PersistedCoachingTurnRecord>(
    encodeDocumentPath("sessions", sessionId, "coachingTurns"),
    12,
    "timestamp asc"
  );

  return records.sort((left, right) => left.questionIndex - right.questionIndex);
}

function toHistoryItem(record: PersistedSessionRecord): SessionHistoryItem {
  return {
    sessionId: record.sessionId,
    scenario: record.scenario || "interview",
    startedAt: record.startedAt || record.updatedAt,
    updatedAt: record.updatedAt,
    primaryFocus: record.primaryFocus || "Interview answer review",
    polishedAnswerPreview:
      record.polishedAnswerPreview || "Saved interview recap is available.",
  };
}

export async function listSessionHistory(limit = 6): Promise<SessionHistoryItem[]> {
  if (shouldUseMockStore()) {
    return Array.from(getMockStore().sessions.values())
      .filter((record) => record.hasRecap)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map(toHistoryItem);
  }

  const records = await listFirestoreDocuments<PersistedSessionRecord>(
    "sessions",
    limit * 3
  );
  return records
    .filter((record) => record.hasRecap)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map(toHistoryItem);
}
