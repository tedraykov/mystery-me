"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { PHASES, type Phase, type StoryLanguage } from "@/lib/types";

export type Send = (
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
) => Promise<boolean>;

/** Title line under the heading: who you are here, the join code, and the player count. */
export function JoinLine({
  code,
  playerCount,
  badge,
}: {
  code: string;
  playerCount: number;
  badge: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/game/${code}`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="join-line">
      <span className="badge badge-amber">{badge}</span>
      <span>
        {t("chrome.code")} <span className="code-chip">{code}</span>
      </span>
      <button className="link-btn" onClick={() => copy(code, "code")}>
        {copied === "code" ? t("chrome.copied") : t("chrome.copy")}
      </button>
      <span aria-hidden>·</span>
      <button className="link-btn" onClick={() => copy(joinUrl, "link")}>
        {copied === "link" ? t("chrome.copied") : t("chrome.copyLink")}
      </button>
      <span aria-hidden>·</span>
      <span>
        👥 {t("chrome.players", { count: playerCount })}
      </span>
    </div>
  );
}

/** The five phases as a stepper. Only phases in `allowed` can be clicked. */
export function PhaseStepper({
  phase,
  allowed = PHASES,
  busy,
  onSelect,
  hint,
}: {
  phase: Phase;
  allowed?: Phase[];
  busy: boolean;
  onSelect: (p: Phase) => void;
  hint?: string;
}) {
  const t = useT();
  const current = PHASES.indexOf(phase);
  return (
    <div className="panel stack-sm">
      <ol className="phases">
        {PHASES.map((p, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={p} className="phase" data-state={state}>
              <button
                type="button"
                disabled={busy || i === current || !allowed.includes(p)}
                aria-current={i === current ? "step" : undefined}
                onClick={() => onSelect(p)}
              >
                <span className="phase-dot">{i < current ? "✓" : i + 1}</span>
                <span className="phase-label">{t(`phase.${p}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="phase-now">{t(`phase.${phase}`)}</p>
      <p className="hint center">{hint ?? t(`phaseHint.${phase}`)}</p>
    </div>
  );
}

/** Says when the story isn't shown in the viewer's language yet, or why not. */
export function StoryNotice({ story }: { story: StoryLanguage }) {
  const t = useT();
  if (story.status === "original" || story.status === "translated") return null;
  const key =
    story.status === "translating"
      ? "translation.translating"
      : story.status === "failed"
        ? "translation.failed"
        : "translation.unavailable";
  // "Translating into English…" names the target; "written in Bulgarian" names the source.
  const language = t(`lang.${story.status === "unavailable" ? story.source : story.shown}`);
  return <div className="notice">{t(key, { language })}</div>;
}
