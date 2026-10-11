"use client";

import { useState } from "react";
import {
  CharacterEditor,
  type CharacterDraft,
  draftFrom,
  emptyDraft,
} from "@/components/CharacterEditor";
import { CharacterCard } from "@/components/CharacterCard";
import { ClueTimerPanel } from "@/components/ClueTimer";
import { JoinLine, PhaseStepper, type Send, StoryNotice } from "@/components/GameChrome";
import { ImportGame } from "@/components/ImportGame";
import { ImportTxt } from "@/components/ImportTxt";
import { IntroEditor } from "@/components/IntroEditor";
import { RoundsEditor } from "@/components/RoundsEditor";
import { initial, markerWords, splitRounds, withInitial } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { mutate } from "@/lib/useGameState";
import type { GameView, HostView } from "@/lib/types";

type Tab = "victim" | "cast" | "intro" | "rounds" | "solution" | "votes";

/**
 * The player who picked the victim runs the game from here: phases, the clue timer, and every
 * character's full description — nobody else sees those.
 */
export function HostDashboard({
  code,
  view: v,
  apply,
}: {
  code: string;
  view: HostView;
  apply: (view: GameView) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("cast");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const send: Send = async (path, method, body) => {
    setBusy(true);
    setActionError(null);
    const res = await mutate(path, method, body);
    if (res.ok) apply(res.view);
    else setActionError(res.error);
    setBusy(false);
    return res.ok;
  };

  return (
    <main className="shell shell-wide stack">
      <header className="stack" style={{ marginTop: 8 }}>
        <div className="stack-sm">
          <h1>{v.game.title}</h1>
          <JoinLine code={code} playerCount={v.playerCount} badge={t("host.badge")} />
        </div>
        <PhaseStepper
          phase={v.game.phase}
          busy={busy}
          onSelect={(phase) => send(`/api/games/${code}`, "PATCH", { phase })}
        />
      </header>

      <div className="tabs" role="tablist">
        {(
          [
            ["victim", t("host.tabVictim")],
            ["cast", t("host.tabCast", { count: v.characters.length })],
            ["intro", t("host.tabIntro")],
            ["rounds", t("host.tabRounds", { count: v.game.round.total })],
            ["solution", t("host.tabSolution")],
            ["votes", t("host.tabVotes", { count: v.voterCount })],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            className="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError && <div className="alert">{actionError}</div>}

      <StoryNotice story={v.story} />

      {v.timer && (
        <ClueTimerPanel
          timer={v.timer}
          busy={busy}
          send={send}
          code={code}
          language={v.story.source}
        />
      )}

      {v.game.phase !== "setup" && (v.game.round.total > 0 || v.game.narration.segments.length > 0) && (
        <RoundsPanel view={v} busy={busy} send={send} code={code} />
      )}

      {tab === "victim" && <VictimTab view={v} />}
      {tab === "cast" && <CastTab view={v} busy={busy} send={send} code={code} />}
      {tab === "intro" && (
        <IntroEditor
          intro={splitRounds(v.game.original.intro).initial}
          introAudio={v.introAudio}
          tts={v.tts}
          busy={busy}
          // Only the opening is edited here; the rounds' public messages are under "Rounds".
          onSave={(text) =>
            send(`/api/games/${code}`, "PATCH", {
              intro: withInitial(v.game.original.intro, text, markerWords(v.story.source).round),
            })
          }
          note={editingOriginal(v, t)}
        />
      )}
      {tab === "rounds" && <RoundsEditor view={v} busy={busy} send={send} code={code} />}
      {tab === "solution" && <SolutionTab view={v} busy={busy} send={send} code={code} />}
      {tab === "votes" && <VotesTab view={v} busy={busy} send={send} code={code} />}
    </main>
  );
}

/** When the host reads a translation, a reminder that editors change the original. */
function editingOriginal(view: HostView, t: T): string | undefined {
  if (view.story.shown === view.story.source) return undefined;
  return t("translation.editingOriginal", { language: t(`lang.${view.story.source}`) });
}

/* ── Rounds ────────────────────────────────────────────────────── */
function RoundsPanel({
  view,
  busy,
  send,
  code,
}: {
  view: HostView;
  busy: boolean;
  send: Send;
  code: string;
}) {
  const t = useT();
  const { round, narration } = view.game;
  const set = (n: number) => send(`/api/games/${code}`, "PATCH", { round: n });
  const narrate = (segment: number | null) =>
    send(`/api/games/${code}`, "PATCH", { narrate: segment });
  const released = narration.segments.filter((s) => s.number <= round.current);
  const presenterPath = `/present/${code}?k=${view.game.presenterToken}`;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(presenterPath, window.location.href).href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the open link still works
    }
  }

  return (
    <div className="panel stack-sm">
      {round.total > 0 && (
        <>
          <div className="eyebrow">{t("rounds.eyebrow")}</div>
          <p>
            {round.current === 0
              ? t("rounds.notStarted")
              : t("rounds.status", { current: round.current, total: round.total })}
            {round.current >= round.total && ` ${t("rounds.allOut")}`}
          </p>
          <div className="row">
            {round.current < round.total && (
              <button className="btn btn-primary" disabled={busy} onClick={() => set(round.current + 1)}>
                {t("rounds.release", { number: round.current + 1 })}
              </button>
            )}
            {round.current > 0 && (
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => set(round.current - 1)}>
                {t("rounds.takeBack", { number: round.current })}
              </button>
            )}
          </div>
          <hr className="divider" />
        </>
      )}

      <div className="eyebrow">{t("rounds.narrationEyebrow")}</div>
      <div className="row">
        {released.map((s) => (
          <button
            key={s.number}
            className={narration.active?.segment === s.number ? "btn" : "btn btn-primary"}
            disabled={busy}
            onClick={() => narrate(s.number)}
          >
            {narration.active?.segment === s.number && "↻ "}
            {s.number === 0 ? t("rounds.narrateOpening") : t("rounds.narrateRound", { number: s.number })}
          </button>
        ))}
        {narration.active && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => narrate(null)}>
            {t("rounds.narrationStop")}
          </button>
        )}
      </div>
      <div className="row row-tight">
        <a className="btn btn-sm" href={presenterPath} target="_blank" rel="noreferrer">
          {t("rounds.presenterOpen")}
        </a>
        <button className="btn btn-sm btn-ghost" onClick={copyLink}>
          {copied ? t("chrome.copied") : t("rounds.presenterCopy")}
        </button>
      </div>
      <p className="hint">{t("rounds.presenterHint")}</p>
      {!view.tts && <p className="hint hint-warn">{t("rounds.ttsOff")}</p>}
    </div>
  );
}

/* ── Cast ──────────────────────────────────────────────────────── */
function CastTab({
  view,
  busy,
  send,
  code,
}: {
  view: HostView;
  busy: boolean;
  send: Send;
  code: string;
}) {
  const t = useT();
  const markers = markerWords(view.story.source);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft());
  const [adding, setAdding] = useState(false);

  function startEdit(id: string) {
    const c = view.characters.find((x) => x.id === id);
    if (!c) return;
    setAdding(false);
    setEditing(id);
    setDraft(draftFrom(c));
  }

  function startAdd() {
    setEditing(null);
    setAdding(true);
    setDraft(emptyDraft());
  }

  async function saveNew() {
    if (await send(`/api/games/${code}/characters`, "POST", draft)) {
      setAdding(false);
      setDraft(emptyDraft());
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (await send(`/api/games/${code}/characters/${editing}`, "PATCH", draft)) setEditing(null);
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("common.confirmDelete", { name }))) return;
    if (await send(`/api/games/${code}/characters/${id}`, "DELETE")) setEditing(null);
  }

  async function move(index: number, dir: -1 | 1) {
    const list = view.characters;
    const target = list[index + dir];
    const self = list[index];
    if (!target || !self) return;
    await send(`/api/games/${code}/characters/${self.id}`, "PATCH", {
      sortOrder: target.sort_order,
    });
    await send(`/api/games/${code}/characters/${target.id}`, "PATCH", {
      sortOrder: self.sort_order,
    });
  }

  return (
    <div className="stack">
      <ImportGame
        code={code}
        hasContent={view.characters.length > 0 || view.game.original.intro.trim() !== ""}
        canImport={view.game.phase === "setup" || view.game.phase === "lobby"}
        busy={busy}
        send={send}
      />

      {view.characters.filter((c) => c.is_victim === 1).length > 1 && (
        <div className="alert">{t("host.manyVictims", markers)}</div>
      )}

      {view.characters.length === 0 && !adding && (
        <div className="notice">{t("host.noCharacters")}</div>
      )}

      {view.characters.map((c, i) =>
        editing === c.id ? (
          <div key={c.id} className="panel stack">
            <div className="eyebrow">{t("host.editing")}</div>
            {editingOriginal(view, t) && <p className="hint">{editingOriginal(view, t)}</p>}
            <CharacterEditor
              draft={draft}
              setDraft={setDraft}
              onSave={saveEdit}
              onCancel={() => setEditing(null)}
              onDelete={() => remove(c.id, c.name)}
              busy={busy}
              saveLabel={t("host.saveChanges")}
              language={view.story.source}
            />
          </div>
        ) : (
          <div key={c.id} className="pick-item cast-row" style={{ cursor: "default" }}>
            <span className="em">{initial(c.name)}</span>
            <span className="stack" style={{ gap: 3, flex: "1 1 150px", minWidth: 0 }}>
              <span className="nm">{c.name}</span>
              <span className="row row-tight" style={{ marginTop: 2 }}>
                {c.is_victim === 1 ? (
                  <span className="badge badge-violet">{t("host.victimYou")}</span>
                ) : c.claimed ? (
                  <span className="badge badge-teal">{t("common.claimedByPlayer")}</span>
                ) : (
                  <span className="badge">{t("common.free")}</span>
                )}
                {c.is_culprit === 1 && <span className="badge badge-blood">{t("host.guilty")}</span>}
                {!c.description.trim() && <span className="badge">{t("host.noDescription")}</span>}
              </span>
            </span>
            <span className="row row-tight">
              <button
                className="btn btn-sm btn-ghost"
                title={t("host.up")}
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                className="btn btn-sm btn-ghost"
                title={t("host.down")}
                disabled={busy || i === view.characters.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button className="btn btn-sm" onClick={() => startEdit(c.id)} disabled={busy}>
                {t("host.edit")}
              </button>
            </span>
          </div>
        ),
      )}

      {adding ? (
        <div className="panel stack">
          <div className="eyebrow">{t("host.newCharacter")}</div>
          <CharacterEditor
            draft={draft}
            setDraft={setDraft}
            onSave={saveNew}
            onCancel={() => setAdding(false)}
            busy={busy}
            saveLabel={t("host.addCharacter")}
            language={view.story.source}
          />
        </div>
      ) : (
        <div className="sticky-bar row" style={{ alignItems: "flex-end" }}>
          <button className="btn btn-primary" onClick={startAdd} disabled={busy}>
            {t("host.addCharacterButton")}
          </button>
          <ImportTxt
            characters={view.characters.map((c) => ({ id: c.id, name: c.original.name }))}
            busy={busy}
            save={(id, name, description) =>
              id
                ? send(`/api/games/${code}/characters/${id}`, "PATCH", { description })
                : send(`/api/games/${code}/characters`, "POST", { name, description })
            }
            saveGame={(field, text) => send(`/api/games/${code}`, "PATCH", { [field]: text })}
          />
        </div>
      )}
    </div>
  );
}

/* ── The victim — the host's own role ──────────────────────────── */
function VictimTab({ view }: { view: HostView }) {
  const t = useT();
  const victim = view.characters.find((c) => c.is_victim === 1);
  if (!victim) {
    return <div className="notice">{t("host.noVictim", markerWords(view.story.source))}</div>;
  }
  return (
    <CharacterCard
      c={{ ...victim, claimed: false, isVictim: true }}
      cluesRead={view.game.cluesRead}
    />
  );
}

/* ── Solution ──────────────────────────────────────────────────── */
function SolutionTab({
  view,
  busy,
  send,
  code,
}: {
  view: HostView;
  busy: boolean;
  send: Send;
  code: string;
}) {
  const t = useT();
  const [text, setText] = useState(view.game.original.solution);
  const [saved, setSaved] = useState(false);
  const culprits = view.characters.filter((c) => c.is_culprit === 1);

  async function save() {
    if (await send(`/api/games/${code}`, "PATCH", { solution: text })) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="eyebrow">{t("host.solutionEyebrow")}</div>
        <h2>{t("host.solutionHeading")}</h2>
        {culprits.length > 0 ? (
          <div className="row row-tight">
            {culprits.map((c) => (
              <span key={c.id} className="badge badge-blood">
                🔪 {c.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="notice">{t("host.noKiller", markerWords(view.story.source))}</div>
        )}
        {editingOriginal(view, t) && <p className="hint">{editingOriginal(view, t)}</p>}
        <label className="field">
          <span>{t("host.solutionLabel")}</span>
          <textarea
            value={text}
            style={{ minHeight: 220 }}
            placeholder={t("host.solutionPlaceholder")}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? t("common.saving") : saved ? t("common.saved") : t("host.saveSolution")}
          </button>
          <span className="spacer" />
          {view.game.phase !== "revealed" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => send(`/api/games/${code}`, "PATCH", { phase: "revealed" })}
            >
              {t("host.revealAll")}
            </button>
          )}
        </div>
        {view.game.phase === "revealed" && (
          <div className="notice">{t("host.revealed")}</div>
        )}
      </div>
    </div>
  );
}

/* ── Votes ─────────────────────────────────────────────────────── */
function VotesTab({
  view,
  busy,
  send,
  code,
}: {
  view: HostView;
  busy: boolean;
  send: Send;
  code: string;
}) {
  const t = useT();
  const max = Math.max(1, ...view.votes.map((v) => v.votes));

  return (
    <div className="stack">
      {view.game.phase !== "voting" && view.game.phase !== "revealed" && (
        <div className="notice">{t("host.votingClosed")}</div>
      )}

      {view.votes.length === 0 ? (
        <div className="notice">{t("host.noVotes")}</div>
      ) : (
        <div className="panel stack">
          <div className="eyebrow">
            {t("host.votedOf", { voters: view.voterCount, players: view.playerCount })}
          </div>
          {view.votes.map((v) => (
            <div key={v.characterId} className="stack-sm">
              <div className="bar-row">
                <span>{v.characterName}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(v.votes / max) * 100}%` }} />
                </span>
                <span className="muted">{v.votes}</span>
              </div>
              {v.reasons.map((r, i) => (
                <p key={i} className="faint" style={{ paddingLeft: 4, fontStyle: "italic" }}>
                  „{r}“
                </p>
              ))}
              <hr className="divider" />
            </div>
          ))}
          <button
            className="btn btn-sm btn-danger"
            disabled={busy}
            onClick={() => {
              if (confirm(t("host.clearVotesConfirm")))
                send(`/api/games/${code}/vote`, "DELETE");
            }}
          >
            {t("host.clearVotes")}
          </button>
        </div>
      )}
    </div>
  );
}
