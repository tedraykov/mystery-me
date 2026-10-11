import { asCreator, currentPlayer, errorResponse, findGame, requireCreator } from "@/lib/auth";
import { run } from "@/lib/db";
import { getLocale, getT } from "@/lib/i18n/server";
import { buildHostView, buildPlayerView } from "@/lib/state";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    if (asCreator(req)) {
      return Response.json(buildHostView(await requireCreator(code), await getLocale()));
    }

    const game = findGame(code);
    const t = await getT();
    if (!game) return Response.json({ error: t("error.gameNotFound") }, { status: 404 });

    const player = await currentPlayer(game);
    if (!player) {
      return Response.json({ error: t("error.notInGame"), needJoin: true }, { status: 401 });
    }

    run("UPDATE players SET last_seen = ? WHERE id = ?", Date.now(), player.id);
    return Response.json(buildPlayerView(game, player, await getLocale()));
  } catch (e) {
    return errorResponse(e);
  }
}
