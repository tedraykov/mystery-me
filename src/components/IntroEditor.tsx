"use client";

import { useState } from "react";
import { ReadAloud } from "@/components/ReadAloud";
import { useT } from "@/lib/i18n/client";

/** The intro story everyone reads (and can hear) once roles open. */
export function IntroEditor({
  intro,
  introAudio,
  tts,
  busy,
  onSave,
  note,
}: {
  intro: string;
  introAudio: string | null;
  tts: boolean;
  busy: boolean;
  onSave: (text: string) => Promise<boolean>;
  /** Shown above the text, e.g. that this is the original of a translated story. */
  note?: string;
}) {
  const t = useT();
  const [text, setText] = useState(intro);
  const [saved, setSaved] = useState(false);
  const dirty = text !== intro;

  async function save() {
    if (await onSave(text)) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="panel stack">
      <div className="eyebrow">{t("intro.eyebrow")}</div>
      <h2>{t("intro.heading")}</h2>
      {note && <p className="hint">{note}</p>}
      <label className="field">
        <span>{t("intro.label")}</span>
        <textarea
          value={text}
          maxLength={10000}
          style={{ minHeight: 260 }}
          placeholder={t("intro.placeholder")}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
          {busy ? t("common.saving") : saved ? t("common.saved") : t("intro.save")}
        </button>
        {!dirty && <ReadAloud src={introAudio} label={t("intro.listen")} />}
      </div>
      {!tts && (
        <p className="hint">{t("intro.ttsOff")}</p>
      )}
    </div>
  );
}
