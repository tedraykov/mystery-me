"use client";

import { type RoundText, paragraphs, victimClues } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { CharacterPrivate } from "@/lib/types";

/**
 * A character's card. For the victim, pass `cluesRead` to mark the clue paragraphs: read ones
 * dimmed with a tick, the next one highlighted.
 */
export function CharacterCard({ c, cluesRead }: { c: CharacterPrivate; cluesRead?: number }) {
  const t = useT();
  const clues = c.isVictim ? victimClues(c.description) : [];
  let clueIndex = 0;

  return (
    <article className="card">
      <header className="card-head">
        <span className="card-name">{c.name}</span>
        {c.isVictim && (
          <div className="card-meta">
            <span>{t("card.victim")}</span>
          </div>
        )}
      </header>

      {c.description.trim() && (
        <section className="section">
          <div className="section-body">
            {paragraphs(c.description).map((p, i) => {
              if (!clues.includes(p) || cluesRead === undefined) return <p key={i}>{p}</p>;
              const n = clueIndex++;
              const state = n < cluesRead ? "read" : n === cluesRead ? "next" : "later";
              return (
                <p key={i} className={`clue-para clue-${state}`}>
                  {state === "read" && "✓ "}
                  {p}
                </p>
              );
            })}
          </div>
        </section>
      )}

      {c.rounds?.map((r, i) => (
        <RoundSection key={r.number} round={r} latest={i === c.rounds!.length - 1} />
      ))}
    </article>
  );
}

function RoundSection({ round, latest }: { round: RoundText; latest: boolean }) {
  const t = useT();
  return (
    <section className="section">
      <div className="eyebrow row row-tight">
        <span>
          {t("card.round", { number: round.number })}
          {round.title && ` · ${round.title}`}
        </span>
        {latest && <span className="badge badge-amber">{t("card.roundNew")}</span>}
      </div>
      <div className="section-body">
        {paragraphs(round.text).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
