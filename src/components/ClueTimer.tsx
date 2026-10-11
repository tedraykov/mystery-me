"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReadAloud } from "@/components/ReadAloud";
import { markerWords, paragraphs } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { ClueTimer } from "@/lib/types";

type Send = (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;

/** While the clue is due and unread, ring again this often. */
const RING_AGAIN_MS = 2 * 60 * 1000;

function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* Browsers only allow sound after a user gesture, so the audio context is created on the first
   tap anywhere on the page and reused for every chime after that. */
let audioCtx: AudioContext | null = null;
function unlockAudio() {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
}

/** Three soft bell tones. */
function chime() {
  if (!audioCtx) return;
  const start = audioCtx.currentTime;
  [880, 1175, 1568].forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    const t = start + i * 0.28;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(t);
    osc.stop(t + 1.3);
  });
  navigator.vibrate?.([300, 150, 300]);
}

/**
 * The victim's clue reminder, shown only to the game master. Counts down 25 minutes per clue,
 * rings when it's time, and lets the victim stop early and read the next clue before time.
 */
export function ClueTimerPanel({
  timer,
  busy,
  send,
  code,
  language,
}: {
  timer: ClueTimer;
  busy: boolean;
  send: Send;
  code: string;
  /** The language the mystery is written in, for the name of its clue marker. */
  language: Locale;
}) {
  const t = useT();
  // Count against the server's clock: the phone's clock may be off by minutes.
  const offset = useMemo(() => timer.serverNow - Date.now(), [timer.serverNow]);
  const [now, setNow] = useState(() => Date.now());
  // The round the victim chose to stop early, if any.
  const [stoppedRound, setStoppedRound] = useState<number | null>(null);
  const lastRing = useRef<{ round: number; at: number } | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("pointerdown", unlockAudio);
    return () => {
      clearInterval(tick);
      document.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  // Keep the phone's screen on while the timer runs.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, []);

  const allRead = timer.total > 0 && timer.next === null;
  const remaining = timer.roundStartedAt + timer.intervalMs - (now + offset);
  const due = !allRead && remaining <= 0;
  const stopped = !allRead && !due && stoppedRound === timer.roundStartedAt;
  const showClue = due || stopped;
  const number = timer.next?.number ?? timer.cluesRead + 1;

  // Ring when the clue becomes due, then again every couple of minutes until it's read.
  useEffect(() => {
    if (!due) return;
    const last = lastRing.current;
    if (last?.round === timer.roundStartedAt && now - last.at < RING_AGAIN_MS) return;
    lastRing.current = { round: timer.roundStartedAt, at: now };
    chime();
  }, [due, now, timer.roundStartedAt]);

  useEffect(() => {
    if (!due) return;
    const title = document.title;
    document.title = t("timer.title");
    return () => {
      document.title = title;
    };
  }, [due, t]);

  async function markRead() {
    if (await send(`/api/games/${code}`, "PATCH", { clueRead: true })) setStoppedRound(null);
  }

  async function restart() {
    if (!confirm(t("timer.restartConfirm"))) return;
    await send(`/api/games/${code}`, "PATCH", { resetClues: true });
  }

  if (allRead) {
    return (
      <div className="panel timer-panel stack-sm">
        <div className="eyebrow">{t("timer.onlyYou")}</div>
        <p className="muted">{t("timer.allRead", { count: timer.total })}</p>
        <div className="row">
          <button className="btn btn-sm btn-ghost" onClick={restart} disabled={busy}>
            {t("timer.restart")}
          </button>
        </div>
      </div>
    );
  }

  const progress = Math.min(1, Math.max(0, 1 - remaining / timer.intervalMs));

  return (
    <div className={`panel timer-panel stack-sm ${due ? "timer-due" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="eyebrow">
          {timer.total > 0
            ? t("timer.clueOf", { number, total: timer.total })
            : t("timer.clue", { number })}
        </div>
        {!showClue && (
          <button className="btn btn-sm" onClick={() => setStoppedRound(timer.roundStartedAt)}>
            {t("timer.readEarly")}
          </button>
        )}
      </div>

      {due ? (
        <div className="timer-clock">
          {t("timer.due")} <span className="timer-over">+{mmss(-remaining)}</span>
        </div>
      ) : stopped ? (
        <div className="timer-clock timer-paused">{t("timer.paused")}</div>
      ) : (
        <>
          <div className="timer-clock">{mmss(remaining)}</div>
          <div className="bar-track">
            <span className="bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      )}

      {showClue && (
        <>
          {timer.next ? (
            <div className="section-body clue-now">
              {paragraphs(timer.next.text).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="hint hint-warn">{t("timer.noClueText", markerWords(language))}</p>
          )}
          <div className="row">
            <button className="btn btn-primary" onClick={markRead} disabled={busy}>
              {t("timer.markRead")}
            </button>
            {timer.next && <ReadAloud src={timer.next.audio} />}
            {stopped && (
              <button className="btn btn-sm btn-ghost" onClick={() => setStoppedRound(null)}>
                {t("timer.notYet")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
