import Anthropic from "@anthropic-ai/sdk";
import { MARKERS } from "./format";
import { LOCALE_ENGLISH_NAMES, type Locale } from "./i18n/locales";

/**
 * Machine translation of a mystery's text with Claude. Callers (src/lib/localize.ts) decide what
 * needs translating and store the result; this file only talks to the API.
 */

const DEFAULT_MODEL = "claude-opus-5";
const model = () => process.env.TRANSLATION_MODEL || DEFAULT_MODEL;

export const translationEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic());

export interface TranslationItem {
  key: string;
  text: string;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, text: { type: "string" } },
        required: ["key", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const quoted = (words: string[]) => words.map((w) => `"${w}"`).join(", ");

function systemPrompt(from: Locale, to: Locale): string {
  const source = LOCALE_ENGLISH_NAMES[from];
  const target = LOCALE_ENGLISH_NAMES[to];
  const all = Object.values(MARKERS);
  const tm = MARKERS[to];
  return `You translate the text of a murder-mystery party game from ${source} into ${target}. Friends play it at a party, reading their character on their phones, so the translation must read as natural ${target} written by a native speaker: keep the tone, the humour and the suspense, and keep every fact — names, times, places, amounts, who knows what — exactly as in the original. Don't add, cut or explain anything.

Format rules — the app parses the text, so these are strict:
- Plain text, no Markdown. Paragraphs are separated by a blank line; every paragraph of the original becomes exactly one paragraph of the translation, in the same order. Keep single line breaks where the original has them.
- People's names: write them the way a ${target} reader would, in ${target}'s script (transliterate; don't translate a name's meaning unless it is a nickname). Use the glossary when one is given, and render each name the same way everywhere.
- Role markers: if a text starts with one of ${quoted(all.flatMap((m) => m.culprit))} (marks the killer), start the translation with "${tm.culprit[0]}" instead, in capitals and in the same place (e.g. alone on the first line). Likewise ${quoted(all.flatMap((m) => m.victim))} (marks the victim) becomes "${tm.victim[0]}". Never start a text with these words otherwise.
- Rounds: a line that starts with a round label such as ${quoted(all.map((m) => `${m.round} 1`))} (alone on its line, optionally followed by a short title) must start with "${tm.round} N" keeping the same number N, and stay on its own line. Never start any other line with the word "${tm.round}" followed by a number.
- Clues: a paragraph that starts with a clue label such as ${quoted(all.map((m) => `${m.clue} 1:`))} must start with "${tm.clue} N:" keeping the same number N. No other paragraph may start with the word "${tm.clue}" — rephrase it if needed.

You get a JSON array of items, each with a key and a text. Return every item exactly once, with its key unchanged and its text translated.`;
}

/** Translate each item's text from `from` into `to`. Throws if any item comes back missing. */
export async function translateItems(
  items: TranslationItem[],
  from: Locale,
  to: Locale,
  glossary: Record<string, string> = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Nothing to say about empty text, and the model shouldn't be asked to invent any.
  const todo = items.filter((i) => {
    if (i.text.trim()) return true;
    out.set(i.key, "");
    return false;
  });
  if (todo.length === 0) return out;

  const names = Object.entries(glossary);
  const prompt = [
    names.length > 0 &&
      `Glossary of character names (original → ${LOCALE_ENGLISH_NAMES[to]}):\n${names
        .map(([a, b]) => `${a} → ${b}`)
        .join("\n")}`,
    `Items:\n${JSON.stringify(todo)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Streaming, so a long description can't run into an HTTP timeout.
  const message = await anthropic()
    .beta.messages.stream({
      model: model(),
      max_tokens: 64000,
      // Translation is routine work; medium effort keeps quality without long thinking.
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      // A declined request is retried server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systemPrompt(from, to),
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();

  if (message.stop_reason === "refusal") throw new Error("translation refused");
  if (message.stop_reason === "max_tokens") throw new Error("translation cut off at max_tokens");
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("translation returned no text");

  const parsed = JSON.parse(text) as { items: TranslationItem[] };
  for (const item of parsed.items) out.set(item.key, item.text);
  const missing = todo.filter((i) => !out.get(i.key)?.trim()).map((i) => i.key);
  if (missing.length > 0) throw new Error(`translation is missing ${missing.join(", ")}`);
  return out;
}
