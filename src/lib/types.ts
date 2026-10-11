import type { RoundText } from "./format";
import type { Locale } from "./i18n/locales";

export type Phase = "setup" | "lobby" | "playing" | "voting" | "revealed";

export const PHASES: Phase[] = ["setup", "lobby", "playing", "voting", "revealed"];

export interface GameRow {
  id: string;
  code: string;
  title: string;
  gm_token: string;
  phase: Phase;
  solution: string;
  intro: string;
  language: Locale;
  clue_round_started_at: number | null;
  clues_read: number;
  current_round: number;
  present_token: string;
  narration_segment: number | null;
  narration_seq: number;
  created_at: number;
  updated_at: number;
}

export interface CharacterRow {
  id: string;
  game_id: string;
  name: string;
  description: string;
  is_culprit: number;
  is_victim: number;
  sort_order: number;
}

export interface PlayerRow {
  id: string;
  game_id: string;
  token: string;
  character_id: string | null;
  joined_at: number;
  last_seen: number;
}

export interface VoteRow {
  game_id: string;
  player_id: string;
  character_id: string;
  reason: string;
  created_at: number;
}

/** The public shape of a character — no secrets. */
export interface CharacterPublic {
  id: string;
  name: string;
  claimed: boolean;
  /** The murdered character, played by the game master — nobody can pick it. */
  isVictim: boolean;
}

/** Everything the owning player (or the GM) may read. */
export interface CharacterPrivate extends CharacterPublic {
  description: string;
  /** Rounds the host has released so far — later ones are never sent to a player. */
  rounds?: RoundText[];
}

/**
 * How the story's text reached this viewer: as written, or translated into their language.
 * "translating" and "failed" fall back to the original until a translation is saved.
 */
export type TranslationStatus = "original" | "translated" | "translating" | "unavailable" | "failed";

export interface StoryLanguage {
  /** The language the mystery is written in. */
  source: Locale;
  /** The language this view asked for. */
  shown: Locale;
  status: TranslationStatus;
}

export interface PlayerView {
  view: "player";
  game: {
    code: string;
    title: string;
    phase: Phase;
    updatedAt: number;
    /** Rounds released to the players, out of all the rounds the characters have. */
    round: { current: number; total: number };
  };
  playerId: string;
  story: StoryLanguage;
  /** The opening story. Empty until the game leaves setup. */
  intro: string;
  /** The story's later parts, once released — what everyone learns as the rounds go on. */
  introRounds: RoundText[];
  introAudio: string | null;
  me: CharacterPrivate | null;
  cast: CharacterPublic[];
  myVote: { characterId: string; reason: string } | null;
  solution: string | null;
  culpritIds: string[] | null;
  tally: { characterId: string; votes: number }[] | null;
}

/** The victim's clue reminder. Only ever sent to the game master. */
export interface ClueTimer {
  /** Server time the current round started; compare against `serverNow`, not the local clock. */
  roundStartedAt: number;
  serverNow: number;
  intervalMs: number;
  cluesRead: number;
  /** Clues found in the victim's description (paragraphs starting with "Clue" / "Улика"). */
  total: number;
  next: { number: number; text: string; audio: string | null } | null;
}

/**
 * The game master — whoever created the game: runs it, writes and edits everything, and sees every
 * character's description.
 */
export interface HostView {
  view: "host";
  game: {
    code: string;
    title: string;
    phase: Phase;
    solution: string;
    intro: string;
    cluesRead: number;
    round: { current: number; total: number };
    /** Secret key of the presenter (TV) link. */
    presenterToken: string;
    /** The parts of the story that can be narrated on the presenter, and which one last started. */
    narration: {
      segments: { number: number; title: string }[];
      active: { segment: number; seq: number } | null;
    };
    updatedAt: number;
    /** The text as written — what the editors change. The fields above are in `story.shown`. */
    original: { title: string; intro: string; solution: string };
  };
  story: StoryLanguage;
  introAudio: string | null;
  tts: boolean;
  characters: (CharacterRow & { claimed: boolean; original: { name: string; description: string } })[];
  /** Present while the game is being played. */
  timer: ClueTimer | null;
  playerCount: number;
  votes: { characterId: string; characterName: string; votes: number; reasons: string[] }[];
  voterCount: number;
}

/** What the TV shows: only what everyone may know, never anyone's role. */
export interface PresenterView {
  view: "presenter";
  game: {
    code: string;
    title: string;
    phase: Phase;
    round: { current: number; total: number };
    playerCount: number;
  };
  /** The part of the story being narrated now; it changes `seq` every time the host starts one. */
  cue: {
    seq: number;
    segment: number;
    title: string;
    text: string;
    audio: string | null;
  } | null;
}

export type GameView = PlayerView | HostView;
