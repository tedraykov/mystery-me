import { cookies } from "next/headers";
import { get } from "./db";
import type { MessageKey, Params } from "./i18n";
import { getT } from "./i18n/server";
import type { GameRow, PlayerRow } from "./types";

const YEAR = 60 * 60 * 24 * 365;

/** Held by the browser that created the game (named "gm" from before the victim ran games). */
export const gmCookie = (code: string) => `mm_gm_${code}`;
export const playerCookie = (code: string) => `mm_pl_${code}`;

export function findGame(code: string): GameRow | undefined {
  return get<GameRow>("SELECT * FROM games WHERE code = ?", code);
}

export async function setGmCookie(code: string, gmToken: string): Promise<void> {
  (await cookies()).set(gmCookie(code), gmToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR,
  });
}

export async function setPlayerCookie(code: string, playerToken: string): Promise<void> {
  (await cookies()).set(playerCookie(code), playerToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR,
  });
}

export async function isCreator(game: GameRow): Promise<boolean> {
  const jar = await cookies();
  return jar.get(gmCookie(game.code))?.value === game.gm_token;
}

export async function currentPlayer(game: GameRow): Promise<PlayerRow | undefined> {
  const jar = await cookies();
  const tok = jar.get(playerCookie(game.code))?.value;
  if (!tok) return undefined;
  return get<PlayerRow>(
    "SELECT * FROM players WHERE game_id = ? AND token = ?",
    game.id,
    tok,
  );
}

/**
 * The creator's page sends `?as=creator`; everything else acts as a player. The same browser can
 * be both, since the creator may also be playing.
 */
export function asCreator(req: Request): boolean {
  return new URL(req.url).searchParams.get("as") === "creator";
}

export function requireGame(code: string): GameRow {
  const game = findGame(code);
  if (!game) throw new HttpError(404, "error.gameNotFound");
  return game;
}

/** Route-handler guard: only the browser that created the game. */
export async function requireCreator(code: string): Promise<GameRow> {
  const game = requireGame(code);
  if (!(await isCreator(game))) throw new HttpError(403, "error.creatorOnly");
  return game;
}

/** Route-handler guard for the presenter (TV): the link's secret key must match the game's. */
export function requirePresenter(code: string, key: string | null): GameRow {
  const game = requireGame(code);
  if (!key || key !== game.present_token) throw new HttpError(403, "error.presenterKey");
  return game;
}

/** Route-handler guard: the game master (creator) edits and runs the game. */
export const requireEditor = (_req: Request, code: string) =>
  requireCreator(code).then((game) => ({ game }));

/** An error to show the caller; its message is translated into their language when sent. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly key: MessageKey,
    readonly params?: Params,
  ) {
    super(key);
  }
}

export async function errorResponse(e: unknown): Promise<Response> {
  const t = await getT();
  if (e instanceof HttpError) {
    return Response.json({ error: t(e.key, e.params) }, { status: e.status });
  }
  console.error(e);
  return Response.json({ error: t("error.internal") }, { status: 500 });
}
