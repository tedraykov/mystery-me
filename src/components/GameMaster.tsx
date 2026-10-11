"use client";

import Link from "next/link";
import { HostDashboard } from "@/components/HostDashboard";
import { useT } from "@/lib/i18n/client";
import { useGameState } from "@/lib/useGameState";

/** The creator's page: they are the game master, so they see and edit the whole game. */
export function GameMaster({ code }: { code: string }) {
  const { state, error, loading, apply } = useGameState(code, 3000, true);
  const t = useT();

  if (loading) {
    return (
      <main className="shell center" style={{ paddingTop: 80 }}>
        <p className="muted">{t("setup.loading")}</p>
      </main>
    );
  }

  if (error || !state || state.view !== "host") {
    return (
      <main className="shell stack center" style={{ paddingTop: 70 }}>
        <h1>🔒</h1>
        <p className="notice">
          {error ?? t("setup.otherBrowser")} {t("setup.ifPlaying")}
        </p>
        <Link href={`/game/${code}`} className="btn btn-primary">
          {t("setup.joinAsPlayer")}
        </Link>
      </main>
    );
  }

  return <HostDashboard code={code} view={state} apply={apply} />;
}
