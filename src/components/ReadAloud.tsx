"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";

// Only one narration plays at a time across the page.
let playing: HTMLAudioElement | null = null;

type Status = "idle" | "loading" | "playing" | "error";

const LABEL: Record<Status, MessageKey> = {
  idle: "audio.listen",
  loading: "audio.loading",
  playing: "audio.stop",
  error: "audio.retry",
};

/** Play/stop button for a server-narrated text. Renders nothing when narration is off. */
export function ReadAloud({ src, label }: { src: string | null; label?: string }) {
  const t = useT();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => () => audio.current?.pause(), []);

  if (!src) return null;

  function toggle() {
    let a = audio.current;
    if (a && !a.paused) {
      a.pause();
      return;
    }
    if (!a) {
      a = new Audio();
      a.preload = "none";
      a.addEventListener("waiting", () => setStatus("loading"));
      a.addEventListener("playing", () => setStatus("playing"));
      a.addEventListener("pause", () => setStatus("idle"));
      a.addEventListener("ended", () => setStatus("idle"));
      a.addEventListener("error", () => setStatus("error"));
      audio.current = a;
    }
    const url = new URL(src!, window.location.href).href;
    if (a.src !== url || status === "error") a.src = url;

    if (playing && playing !== a) playing.pause();
    playing = a;
    setStatus("loading");
    // play() must be called synchronously inside the click for mobile Safari.
    a.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStatus("error");
    });
  }

  return (
    <button type="button" className="btn btn-sm" onClick={toggle}>
      {status === "idle" && label ? `🔊 ${label}` : t(LABEL[status])}
    </button>
  );
}
