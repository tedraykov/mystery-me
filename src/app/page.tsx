import Link from "next/link";
import { cookies } from "next/headers";
import { all } from "@/lib/db";
import { initial } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { CreateForm, JoinForm } from "@/components/HomeForms";
import type { GameRow } from "@/lib/types";

/** Games this browser holds a game-master cookie for. */
async function myGames(): Promise<GameRow[]> {
  const jar = await cookies();
  const codes = jar
    .getAll()
    .filter((c) => c.name.startsWith("mm_gm_"))
    .map((c) => ({ code: c.name.slice("mm_gm_".length), token: c.value }));
  if (codes.length === 0) return [];

  const rows = all<GameRow>(
    `SELECT * FROM games WHERE code IN (${codes.map(() => "?").join(",")}) ORDER BY created_at DESC`,
    ...codes.map((c) => c.code),
  );
  return rows.filter((g) => codes.some((c) => c.code === g.code && c.token === g.gm_token));
}

export default async function HomePage() {
  const games = await myGames();
  const t = await getT();

  return (
    <main className="shell stack" style={{ gap: 26 }}>
      <header className="center stack-sm" style={{ marginTop: 22, marginBottom: 6 }}>
        <div className="eyebrow">{t("app.tagline")}</div>
        <h1>🕯️ {t("app.name")}</h1>
        <p className="muted" style={{ maxWidth: 480, margin: "0 auto" }}>
          {t("home.intro")}
        </p>
      </header>

      <div className="panel stack">
        <div className="eyebrow">{t("home.player")}</div>
        <h2>{t("home.haveCode")}</h2>
        <JoinForm />
      </div>

      <div className="panel stack">
        <div className="eyebrow">{t("home.newGame")}</div>
        <h2>{t("home.creating")}</h2>
        <CreateForm />
      </div>

      {games.length > 0 && (
        <div className="panel stack-sm">
          <div className="eyebrow">{t("home.myGames")}</div>
          {games.map((g) => (
            <Link key={g.id} href={`/gm/${g.code}`} className="pick-item" style={{ gap: 12, textDecoration: "none" }}>
              <span className="em">{initial(g.title)}</span>
              <span className="stack" style={{ gap: 2, flex: 1 }}>
                <span className="nm">{g.title}</span>
                <span className="faint">
                  {g.code} · {t(`phase.${g.phase}`)}
                </span>
              </span>
              <span className="badge">{t("home.open")}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
