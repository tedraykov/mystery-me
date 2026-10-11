import { HttpError, errorResponse, findGame, requireEditor } from "@/lib/auth";
import { json, str } from "@/lib/body";
import { all, run } from "@/lib/db";
import { LOCALES, isLocale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { localize } from "@/lib/localize";
import { roundCount } from "@/lib/format";
import { localSegment, segments } from "@/lib/narration";
import { editorView, localClues } from "@/lib/state";
import { warm } from "@/lib/tts";
import { type CharacterRow, type GameRow, PHASES, type Phase } from "@/lib/types";

/**
 * Synthesize the victim's next clue ahead of time, in every language it is already translated
 * into, so its play button responds instantly.
 */
function warmClue(game: GameRow, index: number): void {
  const cast = all<CharacterRow>("SELECT * FROM characters WHERE game_id = ?", game.id);
  const i = cast.findIndex((c) => c.is_victim === 1);
  if (i < 0) return;
  for (const locale of LOCALES) {
    const local = localize(game, cast, locale, { start: false });
    if (local.story.status !== "original" && local.story.status !== "translated") continue;
    const text = localClues(cast[i], local.characters[i])[index];
    if (text) warm(text);
  }
}

/** Synthesize part `segment` of the story ahead of time, in every language it is ready in. */
function warmSegment(game: GameRow, segment: number): void {
  for (const locale of LOCALES) {
    const local = localize(game, [], locale, { start: false });
    if (local.story.status !== "original" && local.story.status !== "translated") continue;
    const text = localSegment(game, locale, segment);
    if (text) warm(text);
  }
}

/**
 * The game master: rename the game, move it between phases, and write the intro story and the
 * solution and the clue timer.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const { game } = await requireEditor(req, code);
    const body = await json(req);

    if ("title" in body) {
      const title = str(body, "title", { max: 120 }).trim();
      if (!title) throw new HttpError(400, "error.titleEmpty");
      run("UPDATE games SET title = ? WHERE id = ?", title, game.id);
    }

    if ("phase" in body) {
      const phase = str(body, "phase", { max: 20 }) as Phase;
      if (!PHASES.includes(phase)) throw new HttpError(400, "error.invalidPhase");
      run("UPDATE games SET phase = ? WHERE id = ?", phase, game.id);
      // The clue timer starts the first time the game is played, and keeps its place after that.
      if (phase === "playing" && game.clue_round_started_at === null) {
        run("UPDATE games SET clue_round_started_at = ? WHERE id = ?", Date.now(), game.id);
        warmClue(game, game.clues_read);
      }
    }

    if (body.clueRead === true) {
      // The victim read the next clue (on time or early): count it and start a new round.
      if (game.phase !== "playing") throw new HttpError(409, "error.notPlaying");
      run(
        "UPDATE games SET clues_read = clues_read + 1, clue_round_started_at = ? WHERE id = ?",
        Date.now(),
        game.id,
      );
      warmClue(game, game.clues_read + 1);
    }

    if (body.resetClues === true) {
      run(
        "UPDATE games SET clues_read = 0, clue_round_started_at = ? WHERE id = ?",
        game.phase === "playing" ? Date.now() : null,
        game.id,
      );
    }

    if ("round" in body) {
      // The host releases the next round to the players, or takes the last one back.
      const total = roundCount(
        all<CharacterRow>("SELECT * FROM characters WHERE game_id = ?", game.id).map(
          (c) => c.description,
        ).concat(game.intro),
      );
      const round = body.round;
      if (typeof round !== "number" || !Number.isInteger(round) || round < 0 || round > total) {
        throw new HttpError(400, "error.invalidRound");
      }
      run("UPDATE games SET current_round = ? WHERE id = ?", round, game.id);
      if (round > game.current_round) warmSegment(game, round);
    }

    if ("narrate" in body) {
      // The host starts narrating a released part of the story on the presenter (null stops it).
      const segment = body.narrate;
      const current = findGame(code)!;
      if (segment === null) {
        run("UPDATE games SET narration_segment = NULL, narration_seq = narration_seq + 1 WHERE id = ?", game.id);
      } else {
        if (
          typeof segment !== "number" ||
          segment > current.current_round ||
          !segments(game.intro).some((s) => s.number === segment)
        ) {
          throw new HttpError(400, "error.invalidRound");
        }
        run(
          "UPDATE games SET narration_segment = ?, narration_seq = narration_seq + 1 WHERE id = ?",
          segment,
          game.id,
        );
        warmSegment(game, segment);
      }
    }

    if ("language" in body) {
      // Which language the mystery is written in. Translations follow from it on their own.
      const language = str(body, "language", { max: 10 });
      if (!isLocale(language)) throw new HttpError(400, "error.invalidLanguage");
      run("UPDATE games SET language = ? WHERE id = ?", language, game.id);
    }

    if ("intro" in body) {
      // ElevenLabs' multilingual model reads at most 10k characters per request.
      run("UPDATE games SET intro = ? WHERE id = ?", str(body, "intro", { max: 10000 }), game.id);
    }

    if ("solution" in body) {
      run("UPDATE games SET solution = ? WHERE id = ?", str(body, "solution"), game.id);
    }

    run("UPDATE games SET updated_at = ? WHERE id = ?", Date.now(), game.id);
    return Response.json(editorView(findGame(code)!, await getLocale()));
  } catch (e) {
    return errorResponse(e);
  }
}
