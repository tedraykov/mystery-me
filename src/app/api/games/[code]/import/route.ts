import { HttpError, errorResponse, findGame, requireCreator } from "@/lib/auth";
import { json } from "@/lib/body";
import { applyRoleMarker, run, transaction } from "@/lib/db";
import { parseGameFile } from "@/lib/gameFormat";
import { getLocale } from "@/lib/i18n/server";
import { id } from "@/lib/ids";
import { editorView } from "@/lib/state";

/**
 * The game master imports a whole game from one JSON document (see src/lib/gameFormat.ts). It
 * replaces the characters, the intro, the rounds and the solution, so it is only allowed before
 * the game is played.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = await requireCreator(code);
    if (game.phase !== "setup" && game.phase !== "lobby") {
      throw new HttpError(409, "error.importWhilePlaying");
    }

    const body = await json(req);
    const parsed = parseGameFile(body.game, game.language);
    if (!parsed.ok) {
      throw new HttpError(400, "error.importInvalid", { problems: parsed.problems.join("; ") });
    }
    const file = parsed.game;

    transaction(() => {
      // Players who had picked a character are released; the votes go with the old characters.
      run("DELETE FROM characters WHERE game_id = ?", game.id);
      file.characters.forEach((c, i) => {
        const characterId = id();
        run(
          `INSERT INTO characters (id, game_id, name, description, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          characterId,
          game.id,
          c.name,
          c.description,
          i + 1,
        );
        applyRoleMarker(characterId, c.description);
      });
      run(
        `UPDATE games SET title = ?, language = ?, intro = ?, solution = ?, current_round = 0,
           narration_segment = NULL, narration_seq = narration_seq + 1,
           clues_read = 0, clue_round_started_at = NULL, updated_at = ? WHERE id = ?`,
        file.title || game.title,
        file.language ?? game.language,
        file.intro,
        file.solution,
        Date.now(),
        game.id,
      );
    });

    const fresh = findGame(code)!;
    return Response.json(editorView(fresh, await getLocale()));
  } catch (e) {
    return errorResponse(e);
  }
}
