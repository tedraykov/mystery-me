import { timingSafeEqual } from "node:crypto";
import { errorResponse, findGame, setGmCookie } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

/**
 * `/api/games/:code/creator-login?key=…` — hands creator access to this browser. Games made by
 * the local generator script are created outside the browser, so the script prints this link.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = findGame(code.toUpperCase());
    const key = Buffer.from(new URL(req.url).searchParams.get("key") ?? "");
    const expected = Buffer.from(game?.gm_token ?? "");
    if (!game || key.length !== expected.length || !timingSafeEqual(key, expected)) {
      return new Response((await getT())("error.badCreatorLink"), { status: 403 });
    }
    await setGmCookie(game.code, game.gm_token);
    return new Response(null, { status: 303, headers: { location: `/gm/${game.code}` } });
  } catch (e) {
    return errorResponse(e);
  }
}
