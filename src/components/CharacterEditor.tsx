"use client";

import { useState } from "react";
import { CharacterCard } from "@/components/CharacterCard";
import { markerWords, roleMarker, splitRounds, victimClues, withInitial } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { MAX_DESCRIPTION, MAX_FILE_BYTES, nameFromFile, readText } from "@/lib/textFile";

export interface CharacterDraft {
  name: string;
  description: string;
}

export const emptyDraft = (): CharacterDraft => ({
  name: "",
  description: "",
});

/** Editors always change the text as written, never a translation of it. */
export const draftFrom = (c: { original: CharacterDraft }): CharacterDraft => ({
  name: c.original.name,
  description: c.original.description,
});

export function CharacterEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
  busy,
  saveLabel,
  language,
}: {
  draft: CharacterDraft;
  setDraft: (d: CharacterDraft) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  busy: boolean;
  saveLabel: string;
  /** The language the mystery is written in — its marker words are the ones to suggest. */
  language: Locale;
}) {
  const t = useT();
  const markers = markerWords(language);
  const [preview, setPreview] = useState(false);
  const [fileNote, setFileNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) =>
    setDraft({ ...draft, [key]: value });

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileNote({ ok: false, text: t("editor.fileTooBig") });
      return;
    }
    const text = await readText(file);
    if (!text) {
      setFileNote({ ok: false, text: t("editor.fileEmpty") });
      return;
    }
    setDraft({
      ...draft,
      // An empty name is taken from the file name: "Тео.txt" → "Тео".
      name: draft.name.trim() ? draft.name : nameFromFile(file),
      description: text.slice(0, MAX_DESCRIPTION),
    });
    setFileNote(
      text.length > MAX_DESCRIPTION
        ? {
            ok: false,
            text: t("editor.fileTruncated", { file: file.name, max: MAX_DESCRIPTION }),
          }
        : { ok: true, text: t("editor.fileLoaded", { file: file.name }) },
    );
  }

  // Killer / victim are read from the description's first word, not chosen separately.
  const marker = roleMarker(draft.description);
  const backstory = splitRounds(draft.description).initial;
  const clueCount = marker === "victim" ? victimClues(draft.description).length : 0;

  if (preview) {
    return (
      <div className="stack">
        <button className="btn btn-sm btn-ghost" onClick={() => setPreview(false)}>
          {t("editor.back")}
        </button>
        <CharacterCard
          c={{
            id: "preview",
            claimed: false,
            isVictim: marker === "victim",
            name: draft.name || t("common.noName"),
            description: backstory,
          }}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <label className="field">
        <span>{t("editor.name")}</span>
        <input
          type="text"
          value={draft.name}
          maxLength={80}
          placeholder={t("editor.namePlaceholder")}
          onChange={(e) => set("name", e.target.value)}
        />
      </label>

      <label className="field">
        <span>{t("editor.description")}</span>
        <textarea
          value={backstory}
          maxLength={MAX_DESCRIPTION}
          style={{ minHeight: 260 }}
          placeholder={t("editor.descriptionPlaceholder")}
          // Only the backstory is edited here; the character's rounds stay as they are.
          onChange={(e) => set("description", withInitial(draft.description, e.target.value, markers.round))}
        />
        <span className="hint">{t("editor.descriptionHint", markers)}</span>
      </label>

      <div className="row row-tight">
        <label className="btn btn-sm">
          {t("editor.uploadTxt")}
          <input type="file" accept=".txt,text/plain" hidden onChange={upload} disabled={busy} />
        </label>
        {fileNote ? (
          <span className={fileNote.ok ? "hint" : "hint hint-warn"}>{fileNote.text}</span>
        ) : (
          <span className="hint">{t("editor.replacesText")}</span>
        )}
      </div>

      {marker === "culprit" && (
        <div className="notice">{t("editor.killerNotice", markers)}</div>
      )}
      {marker === "victim" && (
        <div className="notice">
          {t("editor.victimNotice")}{" "}
          <span className={clueCount > 0 ? "" : "hint-warn"}>
            {t("editor.cluesFound", { count: clueCount })}
          </span>
          {clueCount === 0 && t("editor.noClues", markers)}
        </div>
      )}

      <div className="row">
        <button className="btn btn-primary" onClick={onSave} disabled={busy || !draft.name.trim()}>
          {busy ? t("common.saving") : saveLabel}
        </button>
        <button className="btn btn-sm" onClick={() => setPreview(true)} disabled={busy}>
          {t("editor.preview")}
        </button>
        <span className="spacer" />
        {onCancel && (
          <button className="btn btn-sm btn-ghost" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
        )}
        {onDelete && (
          <button className="btn btn-sm btn-danger" onClick={onDelete} disabled={busy}>
            {t("common.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
