"use client";
import { useEffect, useRef, useState } from "react";
import { activateKey } from "./key-store";
import { checkKey } from "./transport";
import type { PracticeCarry } from "../usePracticeSession";

export function KeyControl({ active, disabled, maySwitch, onRemove, carry }: { active: boolean; disabled: boolean; maySwitch: () => boolean; onRemove: () => void; carry: PracticeCarry }) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), field = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [remember, setRemember] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (carry.focusKey) { carry.focusKey = false; trigger.current?.focus(); } return () => request.current?.abort(); }, [carry]);
  function close() {
    request.current?.abort(); request.current = null;
    if (field.current) field.current.value = "";
    setError(""); setRemember(false); setBusy(false); dialog.current?.close(); trigger.current?.focus();
  }
  async function apply() {
    const key = field.current?.value.trim();
    if (!key || disabled || request.current || !maySwitch()) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError("");
    try {
      await checkKey(key, controller.signal);
      if (controller.signal.aborted) return;
      carry.switchKey(activateKey(key, remember));
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't reach Google. Try again."); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <>{active ? <span className="inline-flex items-center gap-2"><span className="rounded-md bg-pebble px-2 py-1 text-xs font-semibold text-muted">Your Gemini key</span><button ref={trigger} type="button" className="action" disabled={disabled} onClick={onRemove}>Remove key</button></span> : <button ref={trigger} type="button" className="action" disabled={disabled} onClick={() => { dialog.current?.showModal(); field.current?.focus(); }}>Use your Gemini key</button>}
    <dialog ref={dialog} aria-labelledby="key-title" className="panel fixed inset-0 m-auto max-h-[90dvh] w-[min(30rem,92vw)] overflow-y-auto text-ink backdrop:bg-black/50" onCancel={e => { e.preventDefault(); close(); }}>
      <h2 id="key-title" className="font-display text-xl font-bold">Use your Gemini key</h2>
      <div className="my-3 space-y-2 text-sm leading-6"><p>Requests go from this browser straight to Google and are billed to your key. Your key is never sent to Echo Coach&apos;s server.</p>
      <p>On Google&apos;s free tier (outside the EEA, UK and Switzerland), Google may use what you send to improve its products, and people may review it. Don&apos;t include personal or confidential details.</p>
      <p>Tip: create a key for this site and restrict it to this site&apos;s address and the Generative Language API.</p>
      <p><a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio keys</a> · <a className="underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini API terms</a></p>
      <p>Key mode keeps its own practice history in this tab.</p></div>
      <label className="block text-sm font-bold">Gemini API key<input ref={field} type="password" autoComplete="off" spellCheck={false} disabled={busy} className="input-field my-2" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} disabled={busy} onChange={e => setRemember(e.target.checked)} />Remember in this browser</label>
      <p className="mt-1 text-xs text-muted">Saved in this browser until you remove it. Anyone using this browser, and any script on this site, could read it.</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-2"><button type="button" className="primary" disabled={busy} onClick={() => void apply()}>{busy ? "Checking key…" : "Use key"}</button><button type="button" className="action" onClick={close}>Cancel</button></div>
    </dialog></>;
}
