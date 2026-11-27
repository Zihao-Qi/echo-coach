"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { DemoAudioAsset } from "../content/questions/demo-audio";

// Each visible player owns its element. Coordination is local to this browser tab.
let playing: HTMLAudioElement | undefined;
const mounted = new Set<HTMLAudioElement>();

function rewind(audio: HTMLAudioElement) {
  audio.pause();
  if (audio.readyState > 0) audio.currentTime = 0;
}

export function stopDemoAudio() {
  playing = undefined;
  for (const audio of mounted) rewind(audio);
}

function clock(value: number) {
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AudioPlayer({
  asset,
  headingRef,
}: {
  asset: DemoAudioAsset;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const element = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const [paused, setPaused] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const question = asset.kind === "question";
  const total = asset.durationSeconds;
  const current = Math.min(elapsed, total);

  useEffect(() => {
    const audio = element.current;
    if (!audio) return;
    mounted.add(audio);
    return () => {
      mounted.delete(audio);
      if (playing === audio) playing = undefined;
      rewind(audio);
    };
  }, []);

  function fail(audio: HTMLAudioElement) {
    if (playing === audio) stopDemoAudio();
    setFailed(true);
    headingRef.current?.focus();
  }

  async function toggle() {
    const audio = element.current;
    if (!audio) return;
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

  const label = question
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
        className={failed ? "mt-3 text-sm" : "sr-only"}
      >
        {failed ? "Audio isn't available right now." : ""}
      </p>
      <div
        hidden={failed}
        className={`mt-4 grid items-center gap-2 rounded-xl p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${question ? "bg-pebble" : "bg-night-inset"}`}
      >
        <audio
          ref={element}
          src={asset.path}
          preload="none"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
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
          aria-label={label}
          onClick={() => void toggle()}
        >
          <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
          {question ? label : paused ? "Play" : "Pause"}
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <div
            role="progressbar"
            aria-label={
              question
                ? "Question audio progress"
                : "Sample polished answer audio progress"
            }
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={current}
            aria-valuetext={`${clock(current)} of ${clock(total)}`}
            className={`h-2 flex-1 overflow-hidden rounded-full ${question ? "bg-line-strong" : "bg-night"}`}
          >
            <div
              className={`h-full ${question ? "bg-marigold" : "bg-bright"}`}
              style={{ width: `${(100 * current) / total}%` }}
            />
          </div>
          <span aria-hidden="true" className="text-xs tabular-nums">
            {clock(current)} / {clock(total)}
          </span>
        </div>
        <span
          className={`text-xs ${question ? "text-muted" : "text-night-muted"}`}
        >
          AI-generated voice
        </span>
      </div>
    </>
  );
}
