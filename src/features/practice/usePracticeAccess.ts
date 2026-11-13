"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";

interface PracticeUser { id: string; email: string | null }
export interface PracticeTranscriptionAccess {
  mode: "demo" | "disabled";
  available: boolean;
  reason?: string;
}

const DEFAULT_TRANSCRIPTION_ACCESS: PracticeTranscriptionAccess = {
  mode: "demo",
  available: true,
};

function parseTranscriptionAccess(raw: unknown): PracticeTranscriptionAccess {
  if (!raw || typeof raw !== "object") return DEFAULT_TRANSCRIPTION_ACCESS;
  const candidate = raw as Record<string, unknown>;
  const mode = candidate.mode === "disabled" ? "disabled" : "demo";
  const available = typeof candidate.available === "boolean" ? candidate.available : mode === "demo";
  const reason = typeof candidate.reason === "string" && candidate.reason.trim() ? candidate.reason : undefined;
  return { mode, available, ...(reason ? { reason } : {}) };
}

export function usePracticeAccess() {
  const [mode, setMode] = useState<"loading" | "demo" | "authjs">("loading");
  const [user, setUser] = useState<PracticeUser | null>(null);
  const [storage, setStorage] = useState<"memory" | "firestore">("memory");
  const [mockEvaluation, setMockEvaluation] = useState(true);
  const [localGemini, setLocalGemini] = useState(false);
  const [transcription, setTranscription] = useState<PracticeTranscriptionAccess>(DEFAULT_TRANSCRIPTION_ACCESS);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/practice/access", { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Practice access is unavailable.");
        if (!cancelled) {
          setMode(payload.mode);
          setUser(payload.user || null);
          setStorage(payload.storage);
          setMockEvaluation(payload.mockEvaluation);
          setLocalGemini(payload.localGemini === true);
          setTranscription(parseTranscriptionAccess(payload.transcription));
          setError(null);
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Access is unavailable."); }
    }
    void refresh();
    // Revalidate after account changes in another tab; identity changes unmount private state.
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; controller.abort(); window.removeEventListener("focus", onFocus); };
  }, []);
  // Browser sends the HttpOnly session cookie. No provider token goes into JS headers.
  const headers = useCallback(async (): Promise<Record<string, string>> => ({}), []);
  async function login() {
    setError(null);
    try { await signIn("google", { redirectTo: window.location.pathname + window.location.search }); }
    catch { setError("Google sign-in could not be started. Please try again."); }
  }
  async function logout() {
    try { await signOut({ redirectTo: "/practice" }); }
    catch { setError("Sign-out could not be completed. Please try again."); }
  }
  return { mode, user, storage, mockEvaluation, localGemini, transcription, error, ready: mode === "demo" || (mode === "authjs" && !!user), headers, login, logout };
}
