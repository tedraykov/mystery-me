import { HttpError, currentPlayer, errorResponse, findGame, requireCreator } from "@/lib/auth";
import { json, str } from "@/lib/body";
import { get, run, touchGame } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { buildHostView, buildPlayerView } from "@/lib/state";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = findGame(code);
    if (!game) throw new HttpError(404, "error.gameNotFound");
    if (game.phase !== "voting") throw new HttpError(409, "error.votingClosed");

    const player = await currentPlayer(game);
    if (!player) throw new HttpError(401, "error.notInGame");
    if (!player.character_id) throw new HttpError(409, "error.pickRoleFirst");

    const body = await json(req);
    const characterId = str(body, "characterId", { max: 64 }).trim();
    const reason = str(body, "reason", { max: 2000 }).trim();
    const accused = get<{ is_victim: number }>(
      "SELECT is_victim FROM characters WHERE id = ? AND game_id = ?",
      characterId,
      game.id,
    );
    if (!accused) throw new HttpError(404, "error.noCharacter");
    if (accused.is_victim) throw new HttpError(400, "error.victimNotKiller");

    run(
      `INSERT INTO votes (game_id, player_id, character_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game_id, player_id)
       DO UPDATE SET character_id = excluded.character_id,
                     reason = excluded.reason,
                     created_at = excluded.created_at`,
      game.id,
      player.id,
      characterId,
      reason,
      Date.now(),
    );
    touchGame(game.id);
    return Response.json(buildPlayerView(game, player, await getLocale()));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Host-only: wipe the tally so a round can be re-voted. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = await requireCreator(code);
    run("DELETE FROM votes WHERE game_id = ?", game.id);
    touchGame(game.id);
    return Response.json(buildHostView(game, await getLocale()));
  } catch (e) {
    return errorResponse(e);
  }
}
