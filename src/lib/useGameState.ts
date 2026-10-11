"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useT } from "./i18n/client";
import type { GameView } from "./types";

interface Result {
  state: GameView | null;
  error: string | null;
  /** True until the first successful load. */
  loading: boolean;
  /** Replace local state with a fresh view returned by a mutation. */
  apply: (view: GameView) => void;
  refresh: () => Promise<void>;
}

/**
 * Bootstraps a session, then polls for changes so phase changes land on their own. `asCreator` is
 * the creator's setup page — the same browser may also be a player on the game page.
 */
export function useGameState(code: string, pollMs = 3000, asCreator = false): Result {
  const query = asCreator ? "?as=creator" : "";
  const [state, setState] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ready = useRef(false);
  const t = useT();
  // The server builds the view in the language of the cookie, so a switch needs a fresh view.
  const locale = useLocale();

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/games/${code}/state${query}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? t("common.error"));
      return;
    }
    setError(null);
    setState(data as GameView);
  }, [code, query, t]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/games/${code}/session${query}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) setError(data.error ?? t("common.error"));
      else {
        setState(data as GameView);
        ready.current = true;
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // Bootstraps once per game; `t` only words a fallback error.
  }, [code, query]);

  useEffect(() => {
    if (ready.current) void refresh();
  }, [locale, refresh]);

  useEffect(() => {
    const tick = () => {
      if (ready.current && document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, pollMs]);

  return { state, error, loading, apply: setState, refresh };
}

/** POST/PATCH/DELETE helper that returns the server's fresh view. */
export async function mutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<{ ok: true; view: GameView } | { ok: false; error: string }> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // The server words its errors in the caller's language; the status is a last resort.
  if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  return { ok: true, view: data as GameView };
}
