import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { roleMarker } from "./format";
import { token } from "./ids";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  gm_token    TEXT NOT NULL,
  phase       TEXT NOT NULL DEFAULT 'setup',
  solution    TEXT NOT NULL DEFAULT '',
  intro       TEXT NOT NULL DEFAULT '',
  -- The language the mystery is written in; every other language is a translation of it.
  language    TEXT NOT NULL DEFAULT 'en',
  -- Clue timer: when the current 25-minute round started (NULL until the game is played),
  -- and how many of the victim's clues have been read so far.
  clue_round_started_at INTEGER,
  clues_read  INTEGER NOT NULL DEFAULT 0,
  -- How many rounds the host has released to the players; 0 = only the starting information.
  current_round INTEGER NOT NULL DEFAULT 0,
  -- Secret in the presenter (TV) link; the TV has no player cookie.
  present_token TEXT NOT NULL DEFAULT '',
  -- The narration the host last started on the presenter: which part (0 = the intro, N = round N)
  -- and a counter that changes on every start, so starting the same part again plays it again.
  narration_segment INTEGER,
  narration_seq INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id          TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_culprit  INTEGER NOT NULL DEFAULT 0,
  is_victim   INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_characters_game ON characters(game_id);

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  character_id  TEXT REFERENCES characters(id) ON DELETE SET NULL,
  joined_at     INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_token ON players(game_id, token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_character ON players(character_id);

CREATE TABLE IF NOT EXISTS votes (
  game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id)
);

-- Machine translations of a game's story, one row per language. source_hash is a hash of the
-- original text the row was translated from: when it no longer matches, the row is stale.
CREATE TABLE IF NOT EXISTS game_translations (
  game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  language     TEXT NOT NULL,
  title        TEXT NOT NULL,
  intro        TEXT NOT NULL,
  solution     TEXT NOT NULL,
  source_hash  TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (game_id, language)
);

CREATE TABLE IF NOT EXISTS character_translations (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  language     TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  source_hash  TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (character_id, language)
);
`;

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

/** Bring databases created by older versions up to the current schema. */
function migrate(db: DatabaseSync): void {
  if (!hasColumn(db, "games", "intro")) {
    db.exec("ALTER TABLE games ADD COLUMN intro TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, "games", "clue_round_started_at")) {
    db.exec("ALTER TABLE games ADD COLUMN clue_round_started_at INTEGER");
    db.exec("ALTER TABLE games ADD COLUMN clues_read INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "games", "current_round")) {
    db.exec("ALTER TABLE games ADD COLUMN current_round INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "games", "present_token")) {
    db.exec("ALTER TABLE games ADD COLUMN present_token TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE games ADD COLUMN narration_segment INTEGER");
    db.exec("ALTER TABLE games ADD COLUMN narration_seq INTEGER NOT NULL DEFAULT 0");
  }
  for (const g of db.prepare("SELECT id FROM games WHERE present_token = ''").all() as { id: string }[]) {
    db.prepare("UPDATE games SET present_token = ? WHERE id = ?").run(token(), g.id);
  }
  if (!hasColumn(db, "games", "language")) {
    // Every game made before languages existed was written in Bulgarian.
    db.exec("ALTER TABLE games ADD COLUMN language TEXT NOT NULL DEFAULT 'bg'");
  }
  if (!hasColumn(db, "characters", "is_victim")) {
    db.exec("ALTER TABLE characters ADD COLUMN is_victim INTEGER NOT NULL DEFAULT 0");
  }


  // Characters used to have five structured sections; they are now one plain text. Fold the old
  // sections into it once. The old columns stay in the table, unused.
  if (!hasColumn(db, "characters", "description")) {
    db.exec("ALTER TABLE characters ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    const rows = db
      .prepare("SELECT id, about, secret, knows, goal, important FROM characters")
      .all() as Record<string, string>[];
    const update = db.prepare("UPDATE characters SET description = ? WHERE id = ?");
    for (const r of rows) {
      const parts = [
        r.about.trim(),
        r.secret.trim() && `Твоята тайна:\n${r.secret.trim()}`,
        r.knows.trim() && `Какво знаеш:\n${r.knows.trim()}`,
        r.goal.trim() && `Твоята цел:\n${r.goal.trim()}`,
        r.important.trim() && `Важно:\n${r.important.trim()}`,
      ].filter(Boolean);
      update.run(parts.join("\n\n"), r.id);
    }
  }

  // Role and pair used to be separate fields too; prepend them to the description once, then
  // clear them so this is a no-op on the next boot.
  if (hasColumn(db, "characters", "role")) {
    const rows = db
      .prepare("SELECT id, role, pair, description FROM characters WHERE role != '' OR pair != ''")
      .all() as Record<string, string>[];
    const update = db.prepare(
      "UPDATE characters SET description = ?, role = '', pair = '' WHERE id = ?",
    );
    for (const r of rows) {
      const head = [
        r.role.trim() && `Роля: ${r.role.trim()}`,
        r.pair.trim() && `Двойка с: ${r.pair.trim()}`,
      ].filter(Boolean);
      update.run([head.join("\n"), r.description.trim()].filter(Boolean).join("\n\n"), r.id);
    }
  }

  // Killer and victim come from the description's first word ("KILLER" / "VICTIM"). Recompute them
  // on boot so rows saved before that rule (or under an older word list) agree with it.
  const rows = db.prepare("SELECT id, description FROM characters").all() as {
    id: string;
    description: string;
  }[];
  const update = db.prepare("UPDATE characters SET is_culprit = ?, is_victim = ? WHERE id = ?");
  for (const r of rows) {
    const marker = roleMarker(r.description);
    update.run(marker === "culprit" ? 1 : 0, marker === "victim" ? 1 : 0, r.id);
  }
}

function open(): DatabaseSync {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "mistery.sqlite"));
  // Set the lock timeout first, so every statement after it waits instead of failing.
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Opened on first query, not at import: `next build` imports route modules in parallel workers,
// and none of them should touch the database. Next dev-mode hot reload re-evaluates modules, so
// the handle lives on globalThis to keep one per process.
const globalForDb = globalThis as unknown as { __misteryDb?: DatabaseSync };
function db(): DatabaseSync {
  return (globalForDb.__misteryDb ??= open());
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): void {
  db().prepare(sql).run(...(params as never[]));
}

/**
 * Set a character's killer / victim flags from its description's first word. The victim is played
 * by the game master, so a player who had picked that role is released from it.
 */
export function applyRoleMarker(characterId: string, description: string): void {
  const marker = roleMarker(description);
  run(
    "UPDATE characters SET is_culprit = ?, is_victim = ? WHERE id = ?",
    marker === "culprit" ? 1 : 0,
    marker === "victim" ? 1 : 0,
    characterId,
  );
  if (marker === "victim") {
    run("UPDATE players SET character_id = NULL WHERE character_id = ?", characterId);
  }
}

export function touchGame(gameId: string): void {
  run("UPDATE games SET updated_at = ? WHERE id = ?", Date.now(), gameId);
}
