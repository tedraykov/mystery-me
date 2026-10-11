"use client";

import Link from "next/link";
import { useState } from "react";
import { CharacterCard } from "@/components/CharacterCard";
import { StoryNotice } from "@/components/GameChrome";
import { ReadAloud } from "@/components/ReadAloud";
import { initial, paragraphs } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { mutate, useGameState } from "@/lib/useGameState";
import type { PlayerView } from "@/lib/types";

type Tab = "story" | "role" | "cast";

export function PlayerGame({ code }: { code: string }) {
  const { state, error, loading, apply } = useGameState(code);
  const t = useT();
  const [tabChoice, setTab] = useState<Tab>("role");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <main className="shell center" style={{ paddingTop: 80 }}>
        <p className="muted">{t("player.loading")}</p>
      </main>
    );
  }

  if (error || !state || state.view !== "player") {
    return (
      <main className="shell stack center" style={{ paddingTop: 70 }}>
        <h1>🚪</h1>
        <p className="alert">{error ?? t("player.unavailable")}</p>
        <Link href="/" className="btn">
          {t("player.home")}
        </Link>
      </main>
    );
  }

  const v: PlayerView = state;

  async function claim(characterId: string) {
    setBusy(characterId);
    setActionError(null);
    const res = await mutate(`/api/games/${code}/claim`, "POST", { characterId });
    if (res.ok) apply(res.view);
    else setActionError(res.error);
    setBusy(null);
  }

  async function release() {
    setBusy("release");
    const res = await mutate(`/api/games/${code}/claim`, "POST", { characterId: "" });
    if (res.ok) apply(res.view);
    else setActionError(res.error);
    setBusy(null);
  }

  /* ── Waiting for the game master ─────────────────────────────── */
  if (v.game.phase === "setup") {
    return (
      <main className="shell stack center" style={{ paddingTop: 60 }}>
        <div className="eyebrow">{v.game.code}</div>
        <h1>{v.game.title}</h1>
        <p className="muted">{t("player.preparing")}</p>
        <p className="faint">{t("player.autoRefresh")}</p>
      </main>
    );
  }

  /* ── Role picking ────────────────────────────────────────────── */
  if (!v.me) {
    return (
      <main className="shell stack">
        <GameHeader view={v} />
        <StoryNotice story={v.story} />
        <IntroPanel view={v} />
        <div className="panel stack">
          <div className="eyebrow">{t("player.step1")}</div>
          <h2>{t("player.whoAreYou")}</h2>
          <p className="muted">{t("player.pickHint")}</p>
          {actionError && <div className="alert">{actionError}</div>}
          {v.cast.length === 0 ? (
            <div className="notice">{t("player.noCharacters")}</div>
          ) : (
            <div className="pick">
              {v.cast.map((c) => (
                <button
                  key={c.id}
                  className="pick-item"
                  disabled={c.claimed || c.isVictim || busy !== null}
                  onClick={() => claim(c.id)}
                >
                  <span className="em">{initial(c.name)}</span>
                  <span className="stack" style={{ gap: 2, flex: 1 }}>
                    <span className="nm">{c.name}</span>
                    {c.isVictim && (
                      <span className="faint">{t("player.victimPick")}</span>
                    )}
                  </span>
                  {c.isVictim ? null : c.claimed ? (
                    <span className="badge">{t("player.taken")}</span>
                  ) : (
                    <span className="badge badge-amber">{t("player.thisIsMe")}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ── In game ─────────────────────────────────────────────────── */
  const me = v.me;
  // The story tab only exists while there is an intro.
  const hasStory = v.intro.trim() !== "" || v.introRounds.length > 0;
  const tab = tabChoice === "story" && !hasStory ? "role" : tabChoice;
  return (
    <main className="shell stack">
      <GameHeader view={v} />
      <StoryNotice story={v.story} />

      <div className="tabs" role="tablist">
        {hasStory && (
          <button role="tab" aria-selected={tab === "story"} className="tab" onClick={() => setTab("story")}>
            {t("player.tabStory")}
          </button>
        )}
        <button role="tab" aria-selected={tab === "role"} className="tab" onClick={() => setTab("role")}>
          {t("player.tabRole")}
        </button>
        <button role="tab" aria-selected={tab === "cast"} className="tab" onClick={() => setTab("cast")}>
          {t("player.tabCast")}
        </button>
      </div>

      {actionError && <div className="alert">{actionError}</div>}

      {tab === "story" && <IntroPanel view={v} />}

      {tab === "role" && (
        <>
          <CharacterCard c={me} />
          <button className="btn btn-ghost btn-sm" onClick={release} disabled={busy !== null}>
            {t("player.release")}
          </button>
        </>
      )}

      {tab === "cast" && (
        <div className="pick">
          {v.cast.map((c) => (
            <div key={c.id} className="pick-item" style={{ cursor: "default" }}>
              <span className="em">{initial(c.name)}</span>
              <span className="nm" style={{ flex: 1 }}>
                {c.name}
              </span>
              {c.id === me.id && <span className="badge badge-amber">{t("player.you")}</span>}
              {c.isVictim && <span className="badge badge-violet">{t("player.victim")}</span>}
            </div>
          ))}
        </div>
      )}

      {v.game.phase === "voting" && <VotePanel view={v} code={code} apply={apply} />}
      {v.game.phase === "revealed" && <RevealPanel view={v} />}
    </main>
  );
}

function GameHeader({ view }: { view: PlayerView }) {
  const t = useT();
  return (
    <header className="stack-sm" style={{ marginTop: 8 }}>
      <div className="row row-tight">
        <span className="badge">{view.game.code}</span>
        <span className="badge badge-amber">{t(`phase.${view.game.phase}`)}</span>
      </div>
      <h1>{view.game.title}</h1>
    </header>
  );
}

function IntroPanel({ view }: { view: PlayerView }) {
  const t = useT();
  if (!view.intro.trim() && view.introRounds.length === 0) return null;
  return (
    <div className="panel stack-sm">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="eyebrow">{t("player.storyEyebrow")}</div>
        <ReadAloud src={view.introAudio} />
      </div>
      <div className="section-body">
        {paragraphs(view.intro).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {view.introRounds.map((r) => (
        <div key={r.number} className="stack-sm">
          <hr className="divider" />
          <div className="eyebrow">
            {t("card.round", { number: r.number })}
            {r.title && ` · ${r.title}`}
          </div>
          <div className="section-body">
            {paragraphs(r.text).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VotePanel({
  view,
  code,
  apply,
}: {
  view: PlayerView;
  code: string;
  apply: (v: PlayerView) => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState(view.myVote?.characterId ?? "");
  const [reason, setReason] = useState(view.myVote?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await mutate(`/api/games/${code}/vote`, "POST", {
      characterId: choice,
      reason,
    });
    if (res.ok && res.view.view === "player") {
      apply(res.view);
      setSaved(true);
    } else if (!res.ok) setError(res.error);
    setBusy(false);
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="eyebrow">{t("vote.eyebrow")}</div>
      <h2>{t("vote.heading")}</h2>
      {view.myVote && !saved && (
        <div className="notice">
          {t("vote.already", { name: nameOf(view, view.myVote.characterId) })}
        </div>
      )}
      {saved && <div className="notice">{t("vote.saved")}</div>}
      <label className="field">
        <span>{t("vote.accusation")}</span>
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{t("vote.pick")}</option>
          {view.cast
            .filter((c) => c.id !== view.me?.id && !c.isVictim)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        <span>{t("vote.why")}</span>
        <textarea
          value={reason}
          maxLength={2000}
          placeholder={t("vote.whyPlaceholder")}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <div className="alert">{error}</div>}
      <button className="btn btn-primary" disabled={busy || !choice}>
        {busy ? t("vote.saving") : view.myVote ? t("vote.change") : t("vote.accuse")}
      </button>
    </form>
  );
}

function RevealPanel({ view }: { view: PlayerView }) {
  const t = useT();
  const max = Math.max(1, ...(view.tally ?? []).map((v) => v.votes));
  const culprits = view.cast.filter((c) => view.culpritIds?.includes(c.id));

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="eyebrow">{t("reveal.eyebrow")}</div>
        <h2>{t("reveal.heading")}</h2>
        {culprits.length > 0 && (
          <div className="row row-tight">
            {culprits.map((c) => (
              <span key={c.id} className="badge badge-blood">
                {t("reveal.guilty", { name: c.name })}
              </span>
            ))}
          </div>
        )}
        <div className="section-body">
          {paragraphs(view.solution ?? "").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {!view.solution?.trim() && <p className="muted">{t("reveal.noSolution")}</p>}
        </div>
      </div>

      {view.tally && view.tally.length > 0 && (
        <div className="panel stack-sm">
          <div className="eyebrow">{t("reveal.votes")}</div>
          {view.tally.map((v) => (
            <div key={v.characterId} className="bar-row">
              <span>{nameOf(view, v.characterId)}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(v.votes / max) * 100}%` }} />
              </span>
              <span className="muted">{v.votes}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function nameOf(view: PlayerView, characterId: string): string {
  const c = view.cast.find((x) => x.id === characterId);
  return c?.name ?? "—";
}
