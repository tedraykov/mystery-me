import type { Locale } from "./i18n/locales";
import { splitRounds } from "./format";
import { localize } from "./localize";
import type { GameRow } from "./types";

/**
 * The intro is the story everyone knows. Its first part opens the evening (segment 0); later
 * parts start with a "Round N" line and belong to that round (segment N). The host can narrate
 * any part that has been released on the presenter.
 */
export function segmentText(intro: string, segment: number): string {
  const { initial, rounds } = splitRounds(intro);
  if (segment === 0) return initial;
  return rounds
    .filter((r) => r.number === segment)
    .map((r) => r.text)
    .filter(Boolean)
    .join("\n\n");
}

export function segmentTitle(intro: string, segment: number): string {
  return splitRounds(intro).rounds.find((r) => r.number === segment)?.title ?? "";
}

/** Parts of the story with something to read, in order. */
export function segments(intro: string): { number: number; title: string }[] {
  const { initial, rounds } = splitRounds(intro);
  const numbers = [...new Set(rounds.filter((r) => r.text).map((r) => r.number))].sort((a, b) => a - b);
  return [
    ...(initial ? [{ number: 0, title: "" }] : []),
    ...numbers.map((n) => ({ number: n, title: segmentTitle(intro, n) })),
  ];
}

/** A part of the story in `locale`, falling back to the original when its translation lacks it. */
export function localSegment(game: GameRow, locale: Locale, segment: number): string {
  const local = localize(game, [], locale, { start: false }).game;
  return segmentText(local.intro, segment) || segmentText(game.intro, segment);
}

export function localTitle(game: GameRow, locale: Locale, segment: number): string {
  const local = localize(game, [], locale, { start: false }).game;
  return segmentTitle(local.intro, segment) || segmentTitle(game.intro, segment);
}
