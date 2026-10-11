import { createHash } from "node:crypto";
import { all, get, run } from "./db";
import type { Locale } from "./i18n/locales";
import { translateItems, translationEnabled } from "./translate";
import type { CharacterRow, GameRow, StoryLanguage } from "./types";

/**
 * A mystery is written in one language (`games.language`) and read in each viewer's own. Missing
 * or out-of-date translations are made in the background with Claude and saved, one row per
 * language, in game_translations / character_translations; until then the original is shown and
 * the polling clients pick the translation up on their own.
 */

interface GameTranslationRow {
  title: string;
  intro: string;
  solution: string;
  source_hash: string;
}

interface CharacterTranslationRow {
  character_id: string;
  name: string;
  description: string;
  source_hash: string;
}

/** What a translation was made from. A row whose hash differs from this is stale. */
function hash(language: Locale, ...texts: string[]): string {
  return createHash("sha256").update(JSON.stringify([language, ...texts])).digest("hex");
}

const gameHash = (g: GameRow) => hash(g.language, g.title, g.intro, g.solution);
const characterHash = (g: GameRow, c: CharacterRow) => hash(g.language, c.name, c.description);

export interface Localized {
  game: GameRow;
  characters: CharacterRow[];
  story: StoryLanguage;
}

/**
 * The game and its characters in `locale`. Fresh translations replace the original text; anything
 * missing or stale stays in the original and, when `start` is set, gets translated in the
 * background.
 */
export function localize(
  game: GameRow,
  characters: CharacterRow[],
  locale: Locale,
  { start = true }: { start?: boolean } = {},
): Localized {
  if (locale === game.language) {
    return { game, characters, story: { source: game.language, shown: locale, status: "original" } };
  }

  let stale = false;

  const gt = get<GameTranslationRow>(
    "SELECT * FROM game_translations WHERE game_id = ? AND language = ?",
    game.id,
    locale,
  );
  let localGame = game;
  if (gt?.source_hash === gameHash(game)) {
    localGame = { ...game, title: gt.title, intro: gt.intro, solution: gt.solution };
  } else stale = true;

  const rows = new Map(
    all<CharacterTranslationRow>(
      `SELECT ct.* FROM character_translations ct
       JOIN characters c ON c.id = ct.character_id
       WHERE c.game_id = ? AND ct.language = ?`,
      game.id,
      locale,
    ).map((r) => [r.character_id, r]),
  );
  const localCharacters = characters.map((c) => {
    const t = rows.get(c.id);
    if (t?.source_hash === characterHash(game, c)) {
      return { ...c, name: t.name, description: t.description };
    }
    stale = true;
    return c;
  });

  let status: StoryLanguage["status"] = "translated";
  if (stale) {
    if (!translationEnabled()) status = "unavailable";
    else if (recentlyFailed(game.id, locale)) status = "failed";
    else {
      status = "translating";
      if (start) startTranslation(game.id, locale);
    }
  }

  return {
    game: localGame,
    characters: localCharacters,
    story: { source: game.language, shown: locale, status },
  };
}

/* ── Background translation ────────────────────────────────────── */

// Kept on globalThis so dev-mode hot reloads don't start a second job for the same game.
const jobs = ((globalThis as unknown as { __misteryTranslations?: Map<string, Promise<void>> })
  .__misteryTranslations ??= new Map());
const failures = ((globalThis as unknown as { __misteryTranslationFailures?: Map<string, number> })
  .__misteryTranslationFailures ??= new Map());

/** After a failed translation, wait this long before trying again (clients poll every 3s). */
const RETRY_AFTER_MS = 60_000;
/** How many descriptions are translated at once. */
const PARALLEL = 4;

const jobKey = (gameId: string, locale: Locale) => `${gameId}:${locale}`;

function recentlyFailed(gameId: string, locale: Locale): boolean {
  const at = failures.get(jobKey(gameId, locale));
  return at !== undefined && Date.now() - at < RETRY_AFTER_MS;
}

/** Translate whatever is stale in `locale`. A job already running for it is reused. */
export function startTranslation(gameId: string, locale: Locale): Promise<void> {
  const key = jobKey(gameId, locale);
  let job = jobs.get(key);
  if (!job) {
    job = translateGame(gameId, locale)
      .then(() => void failures.delete(key))
      .catch((e) => {
        failures.set(key, Date.now());
        console.error(`translation of game ${gameId} into ${locale} failed:`, e);
      })
      .finally(() => jobs.delete(key));
    jobs.set(key, job);
  }
  return job;
}

async function translateGame(gameId: string, locale: Locale): Promise<void> {
  const game = get<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.language === locale) return;
  const characters = all<CharacterRow>("SELECT * FROM characters WHERE game_id = ?", gameId);
  const from = game.language;

  const gt = get<{ source_hash: string }>(
    "SELECT source_hash FROM game_translations WHERE game_id = ? AND language = ?",
    gameId,
    locale,
  );
  const existing = new Map(
    all<CharacterTranslationRow>(
      `SELECT ct.* FROM character_translations ct
       JOIN characters c ON c.id = ct.character_id
       WHERE c.game_id = ? AND ct.language = ?`,
      gameId,
      locale,
    ).map((r) => [r.character_id, r]),
  );

  // Hashes of the text being translated now: if it is edited meanwhile, the saved row is stale
  // straight away and the next poll translates the new text.
  const gameSource = gameHash(game);
  const gameStale = gt?.source_hash !== gameSource;
  const staleCharacters = characters
    .map((c) => ({ c, source: characterHash(game, c) }))
    .filter(({ c, source }) => existing.get(c.id)?.source_hash !== source);
  if (!gameStale && staleCharacters.length === 0) return;

  // Names first, in one small request, so every description uses the same spelling of them.
  // Names still translated from earlier text are reused as a glossary.
  const glossary: Record<string, string> = {};
  for (const c of characters) {
    const t = existing.get(c.id);
    if (t && !staleCharacters.some((s) => s.c.id === c.id)) glossary[c.name] = t.name;
  }
  const short = await translateItems(
    [
      ...(gameStale ? [{ key: "title", text: game.title }] : []),
      ...staleCharacters.map(({ c }) => ({ key: `name:${c.id}`, text: c.name })),
    ],
    from,
    locale,
    glossary,
  );
  for (const { c } of staleCharacters) glossary[c.name] = short.get(`name:${c.id}`)!;

  const tasks: (() => Promise<void>)[] = [];
  if (gameStale) {
    tasks.push(async () => {
      const long = await translateItems(
        [
          { key: "intro", text: game.intro },
          { key: "solution", text: game.solution },
        ],
        from,
        locale,
        glossary,
      );
      run(
        `INSERT INTO game_translations (game_id, language, title, intro, solution, source_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(game_id, language) DO UPDATE SET
           title = excluded.title, intro = excluded.intro, solution = excluded.solution,
           source_hash = excluded.source_hash, updated_at = excluded.updated_at`,
        gameId,
        locale,
        short.get("title")!,
        long.get("intro")!,
        long.get("solution")!,
        gameSource,
        Date.now(),
      );
    });
  }
  for (const { c, source } of staleCharacters) {
    tasks.push(async () => {
      const long = await translateItems(
        [{ key: "description", text: c.description }],
        from,
        locale,
        glossary,
      );
      // The character may have been deleted while this ran.
      if (!get("SELECT 1 FROM characters WHERE id = ?", c.id)) return;
      run(
        `INSERT INTO character_translations (character_id, language, name, description, source_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id, language) DO UPDATE SET
           name = excluded.name, description = excluded.description,
           source_hash = excluded.source_hash, updated_at = excluded.updated_at`,
        c.id,
        locale,
        short.get(`name:${c.id}`)!,
        long.get("description")!,
        source,
        Date.now(),
      );
    });
  }

  // Run up to PARALLEL at a time; each saves on its own, so one failure doesn't lose the rest.
  const errors: unknown[] = [];
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let task = queue.shift(); task; task = queue.shift()) {
        await task().catch((e) => errors.push(e));
      }
    }),
  );
  if (errors.length > 0) throw errors[0];
  run("UPDATE games SET updated_at = ? WHERE id = ?", Date.now(), gameId);
}
