import { errorResponse, requireEditor } from "@/lib/auth";
import { json, requiredStr, str } from "@/lib/body";
import { applyRoleMarker, get, run, touchGame } from "@/lib/db";
import { id } from "@/lib/ids";
import { getLocale } from "@/lib/i18n/server";
import { editorView } from "@/lib/state";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const { game } = await requireEditor(req, code);
    const body = await json(req);

    const next =
      (get<{ n: number | null }>(
        "SELECT MAX(sort_order) AS n FROM characters WHERE game_id = ?",
        game.id,
      )?.n ?? 0) + 1;

    const characterId = id();
    const description = str(body, "description");
    run(
      `INSERT INTO characters (id, game_id, name, description, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      characterId,
      game.id,
      requiredStr(body, "name", 80),
      description,
      next,
    );
    applyRoleMarker(characterId, description);

    touchGame(game.id);
    return Response.json(editorView(game, await getLocale()));
  } catch (e) {
    return errorResponse(e);
  }
}
