import { HttpError, errorResponse, isCreator, requireGame, requirePresenter } from "@/lib/auth";
import { toLocale } from "@/lib/i18n";
import { localSegment } from "@/lib/narration";
import { audioResponse, speech } from "@/lib/tts";

/**
 * Part `n` of the story (0 = the opening, N = round N), read aloud in `?lang=`. For the presenter
 * (with the link's key `?k=`) and the game master, and only for parts that have been released.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string; n: string }> }) {
  try {
    const { code, n } = await ctx.params;
    const url = new URL(req.url);
    const key = url.searchParams.get("k");
    let game;
    if (key) game = requirePresenter(code, key);
    else {
      game = requireGame(code);
      if (!(await isCreator(game))) throw new HttpError(403, "error.creatorOnly");
    }

    const segment = Number(n);
    if (!Number.isInteger(segment) || segment < 0 || segment > game.current_round) {
      throw new HttpError(404, "error.noIntro");
    }
    const locale = toLocale(url.searchParams.get("lang") ?? game.language);
    const text = localSegment(game, locale, segment);
    if (!text.trim()) throw new HttpError(404, "error.noIntro");

    return audioResponse(req, await speech(text));
  } catch (e) {
    return errorResponse(e);
  }
}
