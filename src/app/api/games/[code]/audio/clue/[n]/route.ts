import { HttpError, errorResponse, requireCreator } from "@/lib/auth";
import { all } from "@/lib/db";
import { toLocale } from "@/lib/i18n";
import { localize } from "@/lib/localize";
import { localClues } from "@/lib/state";
import { audioResponse, speech } from "@/lib/tts";
import type { CharacterRow } from "@/lib/types";

/**
 * The victim's clue number `n` (1-based), read aloud in `?lang=`. Only the game master.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string; n: string }> }) {
  try {
    const { code, n } = await ctx.params;
    const game = await requireCreator(code);

    const victim = all<CharacterRow>(
      "SELECT * FROM characters WHERE game_id = ? AND is_victim = 1",
      game.id,
    )[0];
    const locale = toLocale(new URL(req.url).searchParams.get("lang") ?? game.language);
    const text = victim
      ? localClues(victim, localize(game, [victim], locale, { start: false }).characters[0])[
          Number(n) - 1
        ]
      : undefined;
    if (!text) throw new HttpError(404, "error.noClue");

    return audioResponse(req, await speech(text));
  } catch (e) {
    return errorResponse(e);
  }
}
