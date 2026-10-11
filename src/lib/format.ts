import type { Locale } from "./i18n/locales";

/** GM textareas are plain text. Split into paragraphs on blank lines. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+$/g, "").trim())
    .filter(Boolean);
}

export type RoleMarker = "culprit" | "victim" | null;

/**
 * The words that mark the killer, the victim and the victim's clues, per language. The first
 * word of each list is the one to write (and the one translations are given); the rest are
 * feminine / definite forms that are recognised too.
 */
export const MARKERS: Record<
  Locale,
  { culprit: string[]; victim: string[]; clue: string; round: string }
> = {
  en: {
    culprit: ["KILLER", "MURDERER", "MURDERESS"],
    victim: ["VICTIM"],
    clue: "Clue",
    round: "Round",
  },
  bg: {
    culprit: ["УБИЕЦ", "УБИЕЦЪТ", "УБИЙЦА", "УБИЙЦАТА"],
    victim: ["УБИТ", "УБИТИЯТ", "УБИТА", "УБИТАТА"],
    clue: "Улика",
    round: "Рунд",
  },
};

/** The marker words to show a writer of a mystery in `locale`. */
export function markerWords(locale: Locale): {
  killer: string;
  victim: string;
  clue: string;
  round: string;
} {
  const m = MARKERS[locale];
  return { killer: m.culprit[0], victim: m.victim[0], clue: m.clue, round: m.round };
}

// A mystery may be written in any language and translated into any other, so markers of every
// language are recognised in every mystery.
const CULPRIT_WORDS = new Set(Object.values(MARKERS).flatMap((m) => m.culprit));
const VICTIM_WORDS = new Set(Object.values(MARKERS).flatMap((m) => m.victim));
const CLUE_START = new RegExp(
  `^[^\\p{L}]*(?:${Object.values(MARKERS)
    .map((m) => m.clue)
    .join("|")})(?!\\p{L})`,
  "iu",
);

/** "KILLER …" / "УБИЕЦ …" → culprit, "VICTIM …" / "УБИТ …" → victim. Leading emoji are ignored. */
export function roleMarker(description: string): RoleMarker {
  const word = /^[^\p{L}]*(\p{L}+)/u.exec(description)?.[1].toUpperCase();
  if (!word) return null;
  if (CULPRIT_WORDS.has(word)) return "culprit";
  if (VICTIM_WORDS.has(word)) return "victim";
  return null;
}

/** How often the victim is reminded to read the next clue. */
export const CLUE_INTERVAL_MS = 25 * 60 * 1000;

/**
 * The victim's clues are paragraphs of their description that start with "Clue" / "Улика", e.g.
 * "Clue 1: There's a key under the flowerpot…". Leading emoji or "#" are allowed.
 */
export function victimClues(description: string): string[] {
  return paragraphs(description).filter((p) => CLUE_START.test(p));
}

/** First letter of a name, for the round avatar in cast lists. */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** A line like "Round 2" or "Рунд 2: At the dock", alone on its line, starts that round's text. */
const ROUND_HEADING = new RegExp(
  `^[^\\p{L}\\d]*(?:${Object.values(MARKERS)
    .map((m) => m.round)
    .join("|")})\\p{L}*\\s+(\\d+)(?!\\d)[\\s:.\\-–—]*(.*)$`,
  "iu",
);

export interface RoundText {
  number: number;
  /** What follows the number on the heading line, e.g. "At the dock". */
  title: string;
  text: string;
}

/**
 * A description is the text a player starts with, followed by any number of rounds, each opened by
 * a "Round N" line. A round's text is what the player learns when the host releases that round.
 */
export function splitRounds(description: string): { initial: string; rounds: RoundText[] } {
  const sections: { number: number; title: string; lines: string[] }[] = [];
  const initial: string[] = [];
  let lines = initial;
  for (const line of description.split("\n")) {
    const m = ROUND_HEADING.exec(line);
    if (m) {
      lines = [];
      sections.push({ number: Number(m[1]), title: m[2].trim(), lines });
    } else lines.push(line);
  }
  return {
    initial: initial.join("\n").trim(),
    rounds: sections.map((r) => ({ number: r.number, title: r.title, text: r.lines.join("\n").trim() })),
  };
}

/** How many rounds the game has: the highest round number any description mentions. */
export function roundCount(descriptions: string[]): number {
  return Math.max(0, ...descriptions.flatMap((d) => splitRounds(d).rounds.map((r) => r.number)));
}

/**
 * Cut a text into subtitles of at most about `max` characters, at sentence ends where possible
 * (and at commas or spaces inside a very long sentence).
 */
export function subtitleChunks(text: string, max = 110): string[] {
  const pieces: string[] = [];
  for (const sentence of text.split(/\n+|(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)) {
    let rest = sentence;
    while (rest.length > max * 1.4) {
      const window = rest.slice(0, max + 20);
      let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" – ")) + 1;
      if (cut < max * 0.4) cut = window.lastIndexOf(" ");
      if (cut <= 0) cut = max;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }
  const out: string[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.length + 1 + p.length <= max) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

/** The inverse of `splitRounds`: the starting text followed by each round under its heading. */
export function joinRounds(
  initial: string,
  rounds: RoundText[],
  word: string = MARKERS.en.round,
): string {
  const parts = [initial.trim()];
  for (const r of [...rounds].sort((a, b) => a.number - b.number)) {
    parts.push(`${word} ${r.number}${r.title ? `: ${r.title}` : ""}\n${r.text.trim()}`.trimEnd());
  }
  return parts.filter(Boolean).join("\n\n");
}

/** `description` with its starting text (everything before the first round) replaced. */
export function withInitial(description: string, initial: string, word?: string): string {
  return joinRounds(initial, splitRounds(description).rounds, word);
}

/**
 * `description` with round `number` set to `text` (and `title`, if given), created when it isn't
 * there yet. An empty round is kept, so a round can exist before anything is written in it.
 */
export function withRound(
  description: string,
  number: number,
  text: string,
  { title, word }: { title?: string; word?: string } = {},
): string {
  const { initial, rounds } = splitRounds(description);
  const old = rounds.find((r) => r.number === number);
  const rest = rounds.filter((r) => r.number !== number);
  return joinRounds(
    initial,
    [...rest, { number, title: title ?? old?.title ?? "", text }],
    word,
  );
}

/** `description` without round `number`. */
export function withoutRound(description: string, number: number, word?: string): string {
  const { initial, rounds } = splitRounds(description);
  return joinRounds(initial, rounds.filter((r) => r.number !== number), word);
}
