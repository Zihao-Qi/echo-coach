"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { DemoAudioAsset } from "../content/questions/demo-audio";

// Each visible player owns its element. Coordination is local to this browser tab.
let playing: HTMLAudioElement | undefined;
let generating: AbortController | undefined;
type Generated = { load: (signal: AbortSignal) => Promise<{ blob: Blob; duration: number }>; onBusy: (value: boolean) => void; disabled: boolean };
const mounted = new Set<HTMLAudioElement>();

function rewind(audio: HTMLAudioElement) {
  audio.pause();
  if (audio.readyState > 0) audio.currentTime = 0;
}

export function stopDemoAudio() {
  generating?.abort();
  playing = undefined;
  for (const audio of mounted) rewind(audio);
}

function clock(value: number) {
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AudioPlayer({
  asset, generated, disabled,
  headingRef,
}: ({ asset: DemoAudioAsset; generated?: never } | { asset?: never; generated: Generated }) & {
  headingRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
}) {
  const element = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const [paused, setPaused] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const cached = useRef<{ url: string; duration: number } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const busyObserver = useRef(generated?.onBusy);
  useEffect(() => { busyObserver.current = generated?.onBusy; }, [generated?.onBusy]);
  useEffect(() => () => {
    if (pending.current) { pending.current.abort(); busyObserver.current?.(false); pending.current = null; }
    if (cached.current) URL.revokeObjectURL(cached.current.url);
    cached.current = null;
  }, []);
  const isGenerated = !!generated;
  const question = asset?.kind === "question";
  const total = asset?.durationSeconds ?? cached.current?.duration ?? 0;
  const current = Math.min(elapsed, total);

  useEffect(() => {
    if (failed && !isGenerated) return;
    const audio = element.current;
    if (!audio) return;
    mounted.add(audio);
    return () => {
      mounted.delete(audio);
      if (playing === audio) playing = undefined;
      rewind(audio);
    };
  }, [failed, isGenerated]);

  function fail(audio: HTMLAudioElement) {
    if (playing === audio) stopDemoAudio();
    setFailed(true);
    headingRef.current?.focus();
  }

  async function toggle() {
    const audio = element.current;
    if (!audio || pending.current || disabled || generated?.disabled) return;
    generating?.abort();
    if (generated && !cached.current) {
      stopDemoAudio(); const controller = new AbortController(); pending.current = generating = controller;
      setLoading(true); setFailed(false); setMessage(""); generated.onBusy(true);
      try {
        const result = await generated.load(controller.signal);
        if (controller.signal.aborted) return;
        cached.current = { url: URL.createObjectURL(result.blob), duration: result.duration };
        audio.src = cached.current.url;
      } catch (e) {
        if (!controller.signal.aborted) { setMessage(e instanceof Error ? e.message : "Audio isn't available right now."); fail(audio); }
        return;
      } finally {
        if (generating === controller) generating = undefined;
        if (pending.current === controller) { pending.current = null; setLoading(false); generated.onBusy(false); }
      }
    }
    setFailed(false);
    const attempt = ++request.current;
    if (!audio.paused || playing === audio) {
      if (playing === audio) playing = undefined;
      audio.pause();
      return;
    }
    if (playing) playing.pause();
    playing = audio;
    try {
      await audio.play();
    } catch {
      if (playing === audio && request.current === attempt) fail(audio);
    }
  }

  const label = generated ? (loading ? "Generating audio…" : failed ? "Try again" : paused ? "Play" : "Pause") : question
    ? paused
      ? "Listen to the question"
      : "Pause question audio"
    : paused
      ? "Play sample polished answer"
      : "Pause sample polished answer";
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className={failed ? (generated ? "mt-3 rounded-xl border border-danger-line bg-danger-tint px-3 py-2 text-sm text-danger" : "mt-3 text-sm") : "sr-only"}
      >
        {failed ? message || "Audio isn't available right now." : loading ? "Generating audio…" : ""}
      </p>
      {(!failed || generated) && (
        <div
          className={`mt-4 grid items-center gap-2 rounded-xl p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${question || generated ? "bg-pebble" : "bg-night-inset"}`}
        >
          <audio
            ref={element}
            src={asset?.path}
            preload="none"
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onTimeUpdate={(event) =>
              setElapsed(event.currentTarget.currentTime)
            }
            onEnded={(event) => {
              if (playing === event.currentTarget) playing = undefined;
              rewind(event.currentTarget);
              setElapsed(0);
              setPaused(true);
            }}
            onError={(event) => {
              if (playing === event.currentTarget) fail(event.currentTarget);
            }}
          />
          <button
            type="button"
            className={`action ${question ? "border-marigold bg-marigold text-white hover:bg-marigold-hover" : "border-bright bg-bright px-3 text-ink hover:bg-canvas focus-visible:outline-bright!"}`}
            disabled={disabled || loading || generated?.disabled}
            aria-label={label}
            onClick={() => void toggle()}
          >
            {!(generated && (loading || failed)) && <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>}
            {generated || question ? label : paused ? "Play" : "Pause"}
          </button>
          {total > 0 && <div className="flex min-w-0 items-center gap-2">
            <div
              role="progressbar"
              aria-label={
                question
                  ? "Question audio progress"
                  : generated ? "Suggested answer audio progress" : "Sample polished answer audio progress"
              }
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={current}
              aria-valuetext={`${clock(current)} of ${clock(total)}`}
              className={`h-2 flex-1 overflow-hidden rounded-full ${question ? "bg-line-strong" : "bg-muted"}`}
            >
              <div
                className={`h-full ${question || generated ? "bg-marigold" : "bg-bright"}`}
                style={{ width: `${(100 * current) / total}%` }}
              />
            </div>
            <span aria-hidden="true" className="text-xs tabular-nums">
              {clock(current)} / {clock(total)}
            </span>
          </div>}
          <span
            className={`text-xs ${question || generated ? "text-muted" : "text-night-muted"}`}
          >
            AI-generated voice{generated ? " · uses your key" : ""}
          </span>
        </div>
      )}
    </>
  );
}
