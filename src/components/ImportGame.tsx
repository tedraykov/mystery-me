"use client";

import { useState } from "react";
import type { Send } from "@/components/GameChrome";
import { useT } from "@/lib/i18n/client";
import { MAX_FILE_BYTES, readText } from "@/lib/textFile";

/**
 * Import a whole mystery from one JSON file (the format is described in the README), or download
 * the current game in the same format. Importing replaces the characters, intro, rounds and
 * solution, so it asks first when there is already something to lose.
 */
export function ImportGame({
  code,
  hasContent,
  canImport,
  busy,
  send,
}: {
  code: string;
  hasContent: boolean;
  /** Only before the game is played. */
  canImport: boolean;
  busy: boolean;
  send: Send;
}) {
  const t = useT();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function load(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNote(null);
    if (file.size > MAX_FILE_BYTES * 3) {
      setNote({ ok: false, text: t("importGame.tooBig") });
      return;
    }
    let game: unknown;
    try {
      game = JSON.parse(await readText(file));
    } catch {
      setNote({ ok: false, text: t("importGame.notJson", { file: file.name }) });
      return;
    }
    if (hasContent && !confirm(t("importGame.confirm"))) return;
    // The server's own message (with every problem found) shows in the dashboard's error bar.
    if (await send(`/api/games/${code}/import`, "POST", { game })) {
      setNote({ ok: true, text: t("importGame.done", { file: file.name }) });
    }
  }

  return (
    <div className="panel stack-sm">
      <div className="row">
        <label className="btn" aria-disabled={busy || !canImport}>
          {t("importGame.button")}
          <input type="file" accept=".json,application/json" hidden onChange={load} disabled={busy || !canImport} />
        </label>
        <a className="btn btn-sm btn-ghost" href={`/api/games/${code}/export`} download>
          {t("importGame.export")}
        </a>
      </div>
      <p className="hint">{canImport ? t("importGame.hint") : t("importGame.locked")}</p>
      {note && <span className={note.ok ? "hint" : "hint hint-warn"}>{note.text}</span>}
    </div>
  );
}
