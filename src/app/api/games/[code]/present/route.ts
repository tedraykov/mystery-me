import { errorResponse, requirePresenter } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { buildPresenterView } from "@/lib/state";

/** The presenter (TV) polls this with the key from its link. It reads, never writes. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const url = new URL(req.url);
    const game = requirePresenter(code, url.searchParams.get("k"));
    const lang = url.searchParams.get("lang");
    const locale = lang && isLocale(lang) ? lang : await getLocale();
    return Response.json(buildPresenterView(game, locale), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
