import { all, get } from "./db";
import { CLUE_INTERVAL_MS, roundCount, splitRounds, victimClues } from "./format";
import type { Locale } from "./i18n/locales";
import { type Localized, localize } from "./localize";
import { localSegment, localTitle, segments } from "./narration";
import { audioUrl, ttsEnabled } from "./tts";
import type {
  CharacterRow,
  ClueTimer,
  GameRow,
  HostView,
  PlayerRow,
  PlayerView,
  PresenterView,
  VoteRow,
} from "./types";

function characters(gameId: string): CharacterRow[] {
  return all<CharacterRow>(
    "SELECT * FROM characters WHERE game_id = ? ORDER BY sort_order, name",
    gameId,
  );
}

function claimedIds(gameId: string): Set<string> {
  const rows = all<{ character_id: string }>(
    "SELECT character_id FROM players WHERE game_id = ? AND character_id IS NOT NULL",
    gameId,
  );
  return new Set(rows.map((r) => r.character_id));
}

/** Route that reads the intro aloud in `locale`. */
const introAudioRoute = (code: string, locale: Locale) =>
  `/api/games/${code}/audio/intro?lang=${locale}`;

/** What a player may read of their description: the start, and only the rounds released so far. */
function myText(description: string, currentRound: number) {
  const { initial, rounds } = splitRounds(description);
  return { description: initial, rounds: rounds.filter((r) => r.number <= currentRound) };
}

export function buildPlayerView(game: GameRow, player: PlayerRow, locale: Locale): PlayerView {
  // Players can't see anything but the title during setup, so nothing is translated before then.
  const local = localize(game, characters(game.id), locale, { start: game.phase !== "setup" });
  const cast = local.characters;
  const claimed = claimedIds(game.id);
  const revealed = game.phase === "revealed";

  const mine = cast.find((c) => c.id === player.character_id) ?? null;

  const vote = get<VoteRow>(
    "SELECT * FROM votes WHERE game_id = ? AND player_id = ?",
    game.id,
    player.id,
  );

  const story = splitRounds(game.phase === "setup" ? "" : local.game.intro);
  const intro = story.initial;
  const introRounds = story.rounds.filter((r) => r.number <= game.current_round && r.text);

  const tally = revealed
    ? all<{ character_id: string; n: number }>(
        "SELECT character_id, COUNT(*) AS n FROM votes WHERE game_id = ? GROUP BY character_id ORDER BY n DESC",
        game.id,
      ).map((r) => ({ characterId: r.character_id, votes: r.n }))
    : null;

  return {
    view: "player",
    game: {
      code: game.code,
      title: local.game.title,
      phase: game.phase,
      updatedAt: game.updated_at,
      round: { current: game.current_round, total: roundCount([...cast.map((c) => c.description), game.intro]) },
    },
    playerId: player.id,
    story: local.story,
    intro,
    introRounds,
    introAudio: audioUrl(introAudioRoute(game.code, locale), intro),
    me: mine && {
      id: mine.id,
      name: mine.name,
      claimed: true,
      isVictim: mine.is_victim === 1,
      ...myText(mine.description, game.current_round),
    },
    cast: cast.map((c) => ({
      id: c.id,
      name: c.name,
      claimed: claimed.has(c.id),
      isVictim: c.is_victim === 1,
    })),
    myVote: vote ? { characterId: vote.character_id, reason: vote.reason } : null,
    solution: revealed ? local.game.solution : null,
    culpritIds: revealed ? cast.filter((c) => c.is_culprit === 1).map((c) => c.id) : null,
    tally,
  };
}

/** Route that reads the victim's clue number `n` (1-based) aloud in `locale`. */
const clueAudioRoute = (code: string, n: number, locale: Locale) =>
  `/api/games/${code}/audio/clue/${n}?lang=${locale}`;

/**
 * The victim's clues in the shown language. If a translation came back with a different number
 * of clue paragraphs, the original ones are used so clue N is always the same clue.
 */
export function localClues(original: CharacterRow, shown: CharacterRow): string[] {
  const clues = victimClues(original.description);
  const local = victimClues(shown.description);
  return local.length === clues.length ? local : clues;
}

function clueTimer(
  game: GameRow,
  original: CharacterRow[],
  local: Localized,
  locale: Locale,
): ClueTimer | null {
  const i = local.characters.findIndex((c) => c.is_victim === 1);
  if (i < 0 || game.phase !== "playing" || game.clue_round_started_at === null) return null;

  const clues = localClues(original[i], local.characters[i]);
  const nextIndex = game.clues_read;
  const nextText = clues[nextIndex];
  return {
    roundStartedAt: game.clue_round_started_at,
    serverNow: Date.now(),
    intervalMs: CLUE_INTERVAL_MS,
    cluesRead: game.clues_read,
    total: clues.length,
    next:
      nextText === undefined
        ? null
        : {
            number: nextIndex + 1,
            text: nextText,
            audio: audioUrl(clueAudioRoute(game.code, nextIndex + 1, locale), nextText),
          },
  };
}

export function buildHostView(game: GameRow, locale: Locale): HostView {
  const original = characters(game.id);
  const local = localize(game, original, locale);
  const cast = local.characters;
  const claimed = claimedIds(game.id);
  const byId = new Map(cast.map((c) => [c.id, c]));

  const voteRows = all<VoteRow>("SELECT * FROM votes WHERE game_id = ?", game.id);
  const grouped = new Map<string, { votes: number; reasons: string[] }>();
  for (const v of voteRows) {
    const entry = grouped.get(v.character_id) ?? { votes: 0, reasons: [] };
    entry.votes += 1;
    if (v.reason.trim()) entry.reasons.push(v.reason.trim());
    grouped.set(v.character_id, entry);
  }

  return {
    view: "host",
    game: {
      code: game.code,
      title: local.game.title,
      phase: game.phase,
      solution: local.game.solution,
      intro: local.game.intro,
      cluesRead: game.clues_read,
      round: {
        current: game.current_round,
        total: roundCount([...original.map((c) => c.description), game.intro]),
      },
      presenterToken: game.present_token,
      narration: {
        segments: segments(game.intro),
        active:
          game.narration_segment === null
            ? null
            : { segment: game.narration_segment, seq: game.narration_seq },
      },
      updatedAt: game.updated_at,
      original: { title: game.title, intro: game.intro, solution: game.solution },
    },
    story: local.story,
    introAudio: audioUrl(introAudioRoute(game.code, locale), splitRounds(local.game.intro).initial),
    tts: ttsEnabled(),
    characters: cast.map((c, i) => ({
      ...c,
      claimed: claimed.has(c.id),
      original: { name: original[i].name, description: original[i].description },
    })),
    timer: clueTimer(game, original, local, locale),
    playerCount: (
      get<{ n: number }>("SELECT COUNT(*) AS n FROM players WHERE game_id = ?", game.id) ?? {
        n: 0,
      }
    ).n,
    votes: [...grouped.entries()]
      .map(([characterId, v]) => ({
        characterId,
        characterName: byId.get(characterId)?.name ?? "—",
        votes: v.votes,
        reasons: v.reasons,
      }))
      .sort((a, b) => b.votes - a.votes),
    voterCount: voteRows.length,
  };
}

/** Route that reads part `n` of the story aloud on the presenter. */
const narrationRoute = (code: string, n: number, locale: Locale, key: string) =>
  `/api/games/${code}/audio/narration/${n}?lang=${locale}&k=${key}`;

/** The TV's view: the game's public face and the narration the host last started. */
export function buildPresenterView(game: GameRow, locale: Locale): PresenterView {
  const cast = characters(game.id);
  const segment = game.narration_segment;
  // Only released parts are sent, so the TV can't show what the host hasn't opened yet.
  const text =
    segment !== null && segment <= game.current_round ? localSegment(game, locale, segment) : "";
  return {
    view: "presenter",
    game: {
      code: game.code,
      title: game.title,
      phase: game.phase,
      round: {
        current: game.current_round,
        total: roundCount([...cast.map((c) => c.description), game.intro]),
      },
      playerCount: (
        get<{ n: number }>("SELECT COUNT(*) AS n FROM players WHERE game_id = ?", game.id) ?? {
          n: 0,
        }
      ).n,
    },
    cue:
      segment !== null && text
        ? {
            seq: game.narration_seq,
            segment,
            title: localTitle(game, locale, segment),
            text,
            audio: audioUrl(narrationRoute(game.code, segment, locale, game.present_token), text),
          }
        : null,
  };
}

/** What the game master sees after they change something. */
export const editorView = buildHostView;
