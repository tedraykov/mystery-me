"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { subtitleChunks } from "@/lib/format";
import { isLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import type { PresenterView } from "@/lib/types";

type Cue = NonNullable<PresenterView["cue"]>;
/** Why there is no sound: the server has no audio ("off"), the browser refused ("blocked"), or it failed. */
type Issue = "off" | "blocked" | "failed";

/** Reading pace for subtitles when there is no audio to follow. */
const CHARS_PER_SECOND = 14;
/** How long the last subtitle stays after the narration ends. */
const LINGER_MS = 5000;

/**
 * The TV screen: the title and round while the story waits, and — when the host starts a part of
 * the story — that part read aloud with large subtitles following the voice.
 */
export function Presenter({
  code,
  presenterKey,
  lang,
}: {
  code: string;
  presenterKey: string;
  lang?: string;
}) {
  const t = useT();
  const uiLocale = useLocale();
  const language = lang && isLocale(lang) ? lang : uiLocale;
  const [view, setView] = useState<PresenterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Browsers only allow sound after a click on the page, so the screen asks for one first.
  const [armed, setArmed] = useState(false);
  const [subtitle, setSubtitle] = useState<{ cue: Cue; text: string } | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const lastCue = useRef<Cue | null>(null);

  const audio = useRef<HTMLAudioElement | null>(null);
  const seen = useRef<number | null | undefined>(undefined);
  const stopCurrent = useRef<(() => void) | null>(null);

  // Poll the server; a cue with a new `seq` is the host pressing "start".
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/games/${code}/present?k=${encodeURIComponent(presenterKey)}&lang=${language}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error ?? t("presenter.invalid"));
        else {
          setError(null);
          setView(data as PresenterView);
        }
      } catch {
        // the TV may lose wifi for a moment; keep what is on screen and try again
      }
    };
    void load();
    const timer = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, presenterKey, language, t]);

  const cue = view?.cue ?? null;
  const cueSeq = cue?.seq ?? null;

  useEffect(() => {
    if (!view) return;
    // What was already started before this screen opened is shown, not replayed.
    if (seen.current === undefined) {
      seen.current = cueSeq;
      if (cue) setSubtitle({ cue, text: subtitleChunks(cue.text).at(-1) ?? "" });
      return;
    }
    if (seen.current === cueSeq) return;
    seen.current = cueSeq;
    stopCurrent.current?.();
    stopCurrent.current = null;
    setIssue(null);
    if (!cue) {
      setSubtitle(null);
      return;
    }
    lastCue.current = cue;
    stopCurrent.current = narrate(cue, audio, setSubtitle, setIssue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cueSeq]);

  useEffect(
    () => () => {
      stopCurrent.current?.();
    },
    [],
  );

  // The QR code leads to the join page of this very server, wherever the TV opened it from.
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/game/${code}`, {
      margin: 1,
      width: 480,
      color: { dark: "#0c0d11", light: "#ece7dc" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [code]);

  if (error) {
    return (
      <div className="presenter presenter-center">
        <p className="presenter-title">{error}</p>
      </div>
    );
  }

  if (!view) return <div className="presenter" />;

  // A click is the browser's permission to play sound: if it was refused, start the part again.
  function retrySound() {
    if (issue !== "blocked" && issue !== "failed") return;
    const cue = lastCue.current;
    if (!cue) return;
    stopCurrent.current?.();
    setIssue(null);
    stopCurrent.current = narrate(cue, audio, setSubtitle, setIssue);
  }

  return (
    <div className="presenter" onClick={retrySound}>
      {issue && (
        <div className="presenter-issue">
          {issue === "off"
            ? t("presenter.soundOff")
            : issue === "blocked"
              ? t("presenter.soundBlocked")
              : t("presenter.soundFailed")}
        </div>
      )}
      {!armed && (
        <button
          className="presenter-arm"
          onClick={() => {
            setArmed(true);
            // A silent play inside the click unlocks sound for every narration after it.
            const a = (audio.current ??= new Audio());
            a.muted = true;
            a.src =
              "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
            a.play().catch(() => {}).finally(() => {
              a.pause();
              a.muted = false;
            });
            void document.documentElement.requestFullscreen?.().catch(() => {});
          }}
        >
          <span className="presenter-title">{view.game.title}</span>
          <span>{t("presenter.enable")}</span>
          <small>{t("presenter.enableHint")}</small>
        </button>
      )}

      {subtitle ? (
        <div className="presenter-stage">
          <div className="presenter-kicker">
            {subtitle.cue.segment > 0
              ? t("presenter.round", { number: subtitle.cue.segment })
              : view.game.title}
            {subtitle.cue.title && ` · ${subtitle.cue.title}`}
          </div>
          <p key={subtitle.text} className="presenter-subtitle">
            {subtitle.text}
          </p>
        </div>
      ) : (
        <div className="presenter-stage presenter-center">
          <div className="presenter-kicker">{t(`phase.${view.game.phase}`)}</div>
          <h1 className="presenter-title">{view.game.title}</h1>
          {view.game.round.current > 0 && (
            <div className="presenter-round">
              {t("presenter.round", { number: view.game.round.current })}
            </div>
          )}
          <div className="presenter-lobby">
            {view.game.phase !== "revealed" && (
              <div className="presenter-join">
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="presenter-qr" src={qr} alt={t("presenter.scan")} />
                )}
                <span>{t("presenter.join")}</span>
                <strong>{view.game.code}</strong>
              </div>
            )}
            <div className="presenter-cast">
              <small>
                {t("presenter.joined", {
                  count: view.game.cast.filter((c) => c.claimed).length,
                  total: view.game.cast.filter((c) => !c.isVictim).length,
                })}
              </small>
              <ul>
                {view.game.cast.map((c) => (
                  <li
                    key={c.id}
                    className={c.claimed ? "is-claimed" : c.isVictim ? "is-victim" : undefined}
                  >
                    {c.isVictim ? "☠️ " : c.claimed ? "✓ " : ""}
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Read `cue` aloud and keep the subtitle on the part being said. Audio drives the subtitles when
 * it plays; if there's no audio (or it fails) they advance at reading pace instead. Returns a
 * function that stops it.
 */
function narrate(
  cue: Cue,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  show: (s: { cue: Cue; text: string } | null) => void,
  report: (issue: Issue | null) => void,
): () => void {
  const chunks = subtitleChunks(cue.text);
  // Each chunk gets time in proportion to its length, plus a little for the pause after it.
  const weights = chunks.map((c) => c.length + 10);
  const total = weights.reduce((a, b) => a + b, 0);
  const at = (fraction: number) => {
    let acc = 0;
    for (let i = 0; i < chunks.length; i++) {
      acc += weights[i] / total;
      if (fraction < acc) return i;
    }
    return chunks.length - 1;
  };

  let done = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let linger: ReturnType<typeof setTimeout> | undefined;
  let a: HTMLAudioElement | null = null;
  let shown = -1;
  const render = (fraction: number) => {
    const i = at(fraction);
    if (i !== shown) {
      shown = i;
      show({ cue, text: chunks[i] });
    }
  };
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    linger = setTimeout(() => show(null), LINGER_MS);
  };
  const byClock = () => {
    const duration = Math.max(3, cue.text.length / CHARS_PER_SECOND) * 1000;
    const start = Date.now();
    clearInterval(timer);
    timer = setInterval(() => {
      const f = (Date.now() - start) / duration;
      if (f >= 1) finish();
      else render(f);
    }, 200);
    render(0);
  };

  if (cue.audio) {
    a = audioRef.current ??= new Audio();
    a.muted = false;
    a.onended = () => {
      render(0.999);
      finish();
    };
    a.ontimeupdate = () => {
      if (a && a.duration > 0) render(a.currentTime / a.duration);
    };
    a.onerror = () => {
      if (done) return;
      report("failed");
      byClock();
    };
    a.src = cue.audio;
    render(0);
    a.play().catch((e: unknown) => {
      // blocked or failed: the subtitles still tell the story
      if (done) return;
      report(e instanceof DOMException && e.name === "NotAllowedError" ? "blocked" : "failed");
      byClock();
    });
  } else {
    report("off");
    byClock();
  }

  return () => {
    done = true;
    clearInterval(timer);
    clearTimeout(linger);
    if (a) {
      a.onended = a.ontimeupdate = a.onerror = null;
      a.pause();
    }
  };
}
