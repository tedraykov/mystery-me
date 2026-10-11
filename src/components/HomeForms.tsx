"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeCodeClient } from "@/lib/codeClient";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

export function JoinForm() {
  const router = useRouter();
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError(t("join.codeLength"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/${code}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("join.notFound"));
      setBusy(false);
      return;
    }
    router.push(`/game/${code}`);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>{t("join.code")}</span>
        <input
          type="text"
          className="code-input"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXXXX"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(normalizeCodeClient(e.target.value))}
        />
      </label>
      {error && <div className="alert">{error}</div>}
      <button className="btn btn-primary" disabled={busy || code.length !== 6}>
        {busy ? t("join.joining") : t("join.submit")}
      </button>
    </form>
  );
}

export function CreateForm() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [title, setTitle] = useState("");
  // The mystery's own language; it starts as the UI language.
  const [language, setLanguage] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, language }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? t("create.failed"));
      setBusy(false);
      return;
    }
    router.push(`/gm/${data.code}`);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>{t("create.title")}</span>
        <input
          type="text"
          placeholder={t("create.titlePlaceholder")}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t("create.language")}</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="alert">{error}</div>}
      <button className="btn" disabled={busy}>
        {busy ? t("create.creating") : t("create.submit")}
      </button>
      <p className="hint">{t("create.hint")}</p>
    </form>
  );
}
