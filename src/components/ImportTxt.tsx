"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { MAX_DESCRIPTION, MAX_FILE_BYTES, nameFromFile, readText } from "@/lib/textFile";

const ADDED_IN_THIS_BATCH = "";

/**
 * Files with these names (in any supported language) fill the game's intro / solution instead of
 * adding a character.
 */
const GAME_FILES: Record<string, { field: "intro" | "solution"; max: number }> = {
  intro: { field: "intro", max: 10000 },
  увод: { field: "intro", max: 10000 },
  solution: { field: "solution", max: MAX_DESCRIPTION },
  решение: { field: "solution", max: MAX_DESCRIPTION },
};

/**
 * Bulk upload: one character per .txt file — the file name is the name, the contents the
 * description. A file named like an existing character updates it instead of adding a duplicate.
 * "Intro.txt" and "Solution.txt" ("Увод.txt", "Решение.txt") set the intro story and the solution.
 */
export function ImportTxt({
  characters,
  busy,
  save,
  saveGame,
}: {
  characters: { id: string; name: string }[];
  busy: boolean;
  /** Create (`id` null) or update a character; resolves to whether it was saved. */
  save: (id: string | null, name: string, description: string) => Promise<boolean>;
  saveGame: (field: "intro" | "solution", text: string) => Promise<boolean>;
}) {
  const t = useT();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function importFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // so picking the same files again still fires
    if (files.length === 0) return;
    setNote(null);

    const existing = new Map(characters.map((c) => [c.name.trim().toLowerCase(), c.id]));
    // Numbered file names ("2 Ива.txt", "10 Тео.txt") keep their order; the number is dropped.
    files.sort((a, b) => a.name.localeCompare(b.name, "bg", { numeric: true }));

    let added = 0;
    let updated = 0;
    const gameParts: string[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const name = nameFromFile(file);
      if (!name || file.size > MAX_FILE_BYTES) {
        problems.push(t("import.tooBig", { file: file.name }));
        continue;
      }
      const text = await readText(file);
      if (!text) {
        problems.push(t("import.empty", { file: file.name }));
        continue;
      }
      const gameFile = GAME_FILES[name.toLowerCase()];
      if (gameFile) {
        if (text.length > gameFile.max) {
          problems.push(t("import.truncated", { file: file.name, max: gameFile.max }));
        }
        if (await saveGame(gameFile.field, text.slice(0, gameFile.max))) {
          gameParts.push(t(`import.${gameFile.field}`));
        } else problems.push(t("import.notSaved", { file: file.name }));
        continue;
      }

      const id = existing.get(name.toLowerCase());
      if (id === ADDED_IN_THIS_BATCH) {
        problems.push(t("import.duplicate", { file: file.name }));
        continue;
      }
      if (text.length > MAX_DESCRIPTION) {
        problems.push(t("import.truncated", { file: file.name, max: MAX_DESCRIPTION }));
      }
      if (!(await save(id ?? null, name, text.slice(0, MAX_DESCRIPTION)))) {
        problems.push(t("import.notSaved", { file: file.name }));
        continue;
      }
      if (id) updated++;
      else {
        added++;
        existing.set(name.toLowerCase(), ADDED_IN_THIS_BATCH);
      }
    }

    const summary = [
      added && t("import.added", { count: added }),
      updated && t("import.updated", { count: updated }),
    ]
      .filter(Boolean)
      .join(", ");
    setNote({
      ok: problems.length === 0,
      text: [
        summary && t("import.charactersDone", { summary }),
        gameParts.length > 0 && t("import.uploaded", { parts: gameParts.join(", ") }),
        ...problems,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return (
    <div className="stack-sm">
      {note && <span className={note.ok ? "hint" : "hint hint-warn"}>{note.text}</span>}
      <label className="btn" aria-disabled={busy}>
        {t("import.button")}
        <input
          type="file"
          accept=".txt,text/plain"
          multiple
          hidden
          onChange={importFiles}
          disabled={busy}
        />
      </label>
    </div>
  );
}
