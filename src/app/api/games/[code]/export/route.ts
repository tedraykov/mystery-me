import { errorResponse, requireCreator } from "@/lib/auth";
import { all } from "@/lib/db";
import { exportGameFile } from "@/lib/gameFormat";
import type { CharacterRow } from "@/lib/types";

/** The game master downloads the game in the whole-game file format, as written. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = await requireCreator(code);
    const characters = all<CharacterRow>(
      "SELECT * FROM characters WHERE game_id = ? ORDER BY sort_order, name",
      game.id,
    );
    return new Response(JSON.stringify(exportGameFile({ ...game, characters }), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${game.code}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
