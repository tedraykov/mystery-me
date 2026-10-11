"use client";

import { useState } from "react";
import type { Send } from "@/components/GameChrome";
import { markerWords, splitRounds, withRound, withoutRound } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { HostView } from "@/lib/types";

/** What a round says in `text` (a description or the intro), or "" when it has nothing. */
const roundOf = (text: string, n: number) => splitRounds(text).rounds.find((r) => r.number === n);

/**
 * Write the rounds: for each, a public message (announced on the TV and shown to everyone) and
 * what each character learns. They are stored as "Round N" sections of the intro and of each
 * character's description, always in the language the mystery is written in.
 */
export function RoundsEditor({
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
  const word = markerWords(view.story.source).round;
  const intro = view.game.original.intro;
  const players = view.characters.filter((c) => c.is_victim !== 1);
  const numbers = [
    ...new Set(
      [intro, ...view.characters.map((c) => c.original.description)].flatMap((text) =>
        splitRounds(text).rounds.map((r) => r.number),
      ),
    ),
  ].sort((a, b) => a - b);
  const last = numbers.at(-1) ?? 0;

  const patchIntro = (text: string) => send(`/api/games/${code}`, "PATCH", { intro: text });
  const patchCharacter = (id: string, description: string) =>
    send(`/api/games/${code}/characters/${id}`, "PATCH", { description });

  async function removeLast() {
    if (!confirm(t("rounds.removeConfirm", { number: last }))) return;
    if (!(await patchIntro(withoutRound(intro, last, word)))) return;
    for (const c of view.characters) {
      if (roundOf(c.original.description, last)) {
        await patchCharacter(c.id, withoutRound(c.original.description, last, word));
      }
    }
  }

  return (
    <div className="stack">
      {players.length === 0 && <div className="notice">{t("rounds.needCharacters")}</div>}
      {numbers.length === 0 && players.length > 0 && (
        <div className="notice">{t("rounds.empty")}</div>
      )}

      {numbers.map((n) => (
        <RoundCard
          key={n}
          number={n}
          view={view}
          players={players}
          busy={busy}
          word={word}
          patchIntro={patchIntro}
          patchCharacter={patchCharacter}
          onRemove={n === last ? removeLast : undefined}
        />
      ))}

      <div className="sticky-bar row">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => patchIntro(withRound(intro, last + 1, "", { word }))}
        >
          {t("rounds.add")}
        </button>
      </div>
    </div>
  );
}

function RoundCard({
  number,
  view,
  players,
  busy,
  word,
  patchIntro,
  patchCharacter,
  onRemove,
}: {
  number: number;
  view: HostView;
  players: HostView["characters"];
  busy: boolean;
  word: string;
  patchIntro: (text: string) => Promise<boolean>;
  patchCharacter: (id: string, description: string) => Promise<boolean>;
  onRemove?: () => void;
}) {
  const t = useT();
  const intro = view.game.original.intro;
  const saved = {
    title: roundOf(intro, number)?.title ?? "",
    message: roundOf(intro, number)?.text ?? "",
    texts: Object.fromEntries(
      players.map((c) => [c.id, roundOf(c.original.description, number)?.text ?? ""]),
    ) as Record<string, string>,
  };
  const [title, setTitle] = useState(saved.title);
  const [message, setMessage] = useState(saved.message);
  const [texts, setTexts] = useState(saved.texts);
  const [done, setDone] = useState(false);

  const changed = players.filter((c) => (texts[c.id] ?? "") !== saved.texts[c.id]);
  const dirty = title !== saved.title || message !== saved.message || changed.length > 0;

  async function save() {
    if (title !== saved.title || message !== saved.message) {
      if (!(await patchIntro(withRound(intro, number, message, { title, word })))) return;
    }
    for (const c of changed) {
      if (!(await patchCharacter(c.id, withRound(c.original.description, number, texts[c.id], { word })))) return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="panel stack">
      <div className="row">
        <h2>{t("rounds.heading", { number })}</h2>
        <span className="spacer" />
        {number <= view.game.round.current && <span className="badge badge-teal">✓</span>}
      </div>

      <label className="field">
        <span>{t("rounds.titleLabel")}</span>
        <input type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label className="field">
        <span>{t("rounds.publicLabel")}</span>
        <textarea
          value={message}
          style={{ minHeight: 110 }}
          placeholder={t("rounds.publicPlaceholder")}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      <hr className="divider" />

      {players.map((c) => (
        <label key={c.id} className="field">
          <span>{t("rounds.characterLabel", { name: c.original.name })}</span>
          <textarea
            value={texts[c.id] ?? ""}
            style={{ minHeight: 110 }}
            placeholder={t("rounds.characterPlaceholder")}
            onChange={(e) => setTexts({ ...texts, [c.id]: e.target.value })}
          />
        </label>
      ))}

      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
          {busy ? t("common.saving") : done ? t("common.saved") : t("rounds.save", { number })}
        </button>
        <span className="spacer" />
        {onRemove && (
          <button className="btn btn-sm btn-danger" onClick={onRemove} disabled={busy}>
            {t("rounds.remove", { number })}
          </button>
        )}
      </div>
    </div>
  );
}
