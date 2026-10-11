import { HttpError, currentPlayer, errorResponse, findGame, isCreator } from "@/lib/auth";
import { toLocale } from "@/lib/i18n";
import { localSegment } from "@/lib/narration";
import { audioResponse, speech } from "@/lib/tts";

/**
 * The opening of the story (not its later parts, which are released with the rounds), read aloud in `?lang=` (the original when that translation isn't ready).
 * Players can hear it once the game leaves setup.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const game = findGame(code);
    if (!game) throw new HttpError(404, "error.gameNotFound");

    if (!(await isCreator(game))) {
      if (!(await currentPlayer(game))) throw new HttpError(401, "error.notInGame");
      if (game.phase === "setup") throw new HttpError(403, "error.storyNotReady");
    }
    const locale = toLocale(new URL(req.url).searchParams.get("lang") ?? game.language);
    const intro = localSegment(game, locale, 0);
    if (!intro.trim()) throw new HttpError(404, "error.noIntro");

    return audioResponse(req, await speech(intro));
  } catch (e) {
    return errorResponse(e);
  }
}
