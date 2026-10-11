import { HttpError, errorResponse, setGmCookie } from "@/lib/auth";
import { json, str } from "@/lib/body";
import { get, run } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { gameCode, id, token } from "@/lib/ids";

export async function POST(req: Request) {
  try {
    const body = await json(req);
    // The mystery is written in this language; it defaults to the creator's UI language.
    const language = "language" in body ? str(body, "language", { max: 10 }) : await getLocale();
    if (!isLocale(language)) throw new HttpError(400, "error.invalidLanguage");
    const title = str(body, "title", { max: 120 }).trim() || (await getT())("create.untitled");

    let code = gameCode();
    for (let i = 0; i < 10 && get("SELECT 1 FROM games WHERE code = ?", code); i++) {
      code = gameCode();
    }

    const gameId = id();
    const gmToken = token();
    const now = Date.now();
    run(
      `INSERT INTO games (id, code, title, gm_token, present_token, phase, solution, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'setup', '', ?, ?, ?)`,
      gameId,
      code,
      title,
      gmToken,
      token(),
      language,
      now,
      now,
    );

    await setGmCookie(code, gmToken);
    return Response.json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}
