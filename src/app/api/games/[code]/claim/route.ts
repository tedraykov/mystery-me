import { HttpError, currentPlayer, errorResponse, findGame } from "@/lib/auth";
import { json, str } from "@/lib/body";
import { get, run, touchGame } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { localize } from "@/lib/localize";
import { buildPlayerView } from "@/lib/state";
import type { CharacterRow } from "@/lib/types";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = findGame(code);
    if (!game) throw new HttpError(404, "error.gameNotFound");

    const player = await currentPlayer(game);
    if (!player) throw new HttpError(401, "error.notInGame");

    const locale = await getLocale();
    const body = await json(req);
    const characterId = str(body, "characterId", { max: 64 }).trim();

    if (!characterId) {
      // Release the current role.
      run("UPDATE players SET character_id = NULL WHERE id = ?", player.id);
      touchGame(game.id);
      const fresh = { ...player, character_id: null };
      return Response.json(buildPlayerView(game, fresh, locale));
    }

    const character = get<CharacterRow>(
      "SELECT * FROM characters WHERE id = ? AND game_id = ?",
      characterId,
      game.id,
    );
    if (!character) throw new HttpError(404, "error.noCharacter");

    // The victim is played by the game master; nobody else can take the role.
    if (character.is_victim === 1) throw new HttpError(403, "error.victimNotPlayable");

    const takenBy = get<{ id: string }>(
      "SELECT id FROM players WHERE character_id = ?",
      characterId,
    );
    if (takenBy && takenBy.id !== player.id) {
      const [shown] = localize(game, [character], locale, { start: false }).characters;
      throw new HttpError(409, "error.characterTaken", { name: shown.name });
    }

    run("UPDATE players SET character_id = ? WHERE id = ?", characterId, player.id);
    touchGame(game.id);
    return Response.json(buildPlayerView(game, { ...player, character_id: characterId }, locale));
  } catch (e) {
    return errorResponse(e);
  }
}
