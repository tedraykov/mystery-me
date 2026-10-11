import { joinRounds, markerWords, roleMarker, splitRounds, type RoundText } from "./format";
import { type Locale, isLocale } from "./i18n/locales";

/**
 * The whole-game file: a mystery written elsewhere, in one JSON document.
 *
 *   {
 *     "title": "Murder at the villa",
 *     "language": "en",                       // optional: the language it is written in
 *     "intro": "…",                           // the opening everyone hears (увод)
 *     "characters": [
 *       { "name": "Ana", "backstory": "…", "role": "killer" },                // role: killer | victim
 *       { "name": "Vic", "backstory": "…", "role": "victim", "clues": ["…"] } // victim's clues, read aloud
 *     ],
 *     "rounds": [
 *       { "title": "The dock",                 // optional
 *         "message": "…",                       // shared with everyone, announced on the TV
 *         "characters": { "Ana": "…" } }        // what each named character learns this round
 *     ],
 *     "reveal": "…"                             // the solution, shown at the end
 *   }
 */
export interface GameFile {
  title: string;
  language: Locale | null;
  intro: string;
  characters: { name: string; description: string }[];
  /** The intro and each description already carry their rounds as "Round N" sections. */
  solution: string;
  rounds: number;
}

export const MAX_INTRO = 10000;
export const MAX_DESCRIPTION = 8000;
export const MAX_SOLUTION = 8000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Check `input` against the format and turn it into what is stored. Returns every problem found
 * (not just the first), so the file can be fixed in one go.
 */
export function parseGameFile(
  input: unknown,
  fallbackLanguage: Locale,
): { ok: true; game: GameFile } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(input)) return { ok: false, problems: ["the file must be a JSON object"] };

  const text = (value: unknown, path: string, { required = false } = {}): string => {
    if (value === undefined || value === null) {
      if (required) problems.push(`${path} is required`);
      return "";
    }
    if (typeof value !== "string") {
      problems.push(`${path} must be text`);
      return "";
    }
    const trimmed = value.replace(/\r\n?/g, "\n").trim();
    if (required && !trimmed) problems.push(`${path} is empty`);
    return trimmed;
  };

  let language: Locale | null = null;
  if (input.language !== undefined) {
    if (typeof input.language === "string" && isLocale(input.language)) language = input.language;
    else problems.push(`language must be one of the supported codes (e.g. "en", "bg")`);
  }
  const words = markerWords(language ?? fallbackLanguage);

  const title = text(input.title, "title");
  const intro = text(input.intro, "intro");
  const solution = text(input.reveal ?? input.solution, "reveal");

  const rawCharacters = Array.isArray(input.characters) ? input.characters : null;
  if (!rawCharacters || rawCharacters.length === 0) {
    problems.push("characters must be a list with at least one character");
  }

  const characters: { name: string; description: string }[] = [];
  const byName = new Map<string, number>();
  let victims = 0;
  (rawCharacters ?? []).forEach((raw, i) => {
    const at = `characters[${i}]`;
    if (!isObject(raw)) {
      problems.push(`${at} must be an object`);
      return;
    }
    const name = text(raw.name, `${at}.name`, { required: true }).slice(0, 80);
    let backstory = text(raw.backstory ?? raw.description, `${at}.backstory`);
    const role = raw.role;
    if (role !== undefined && role !== null && role !== "killer" && role !== "victim") {
      problems.push(`${at}.role must be "killer" or "victim"`);
    }
    // The role is stored as the first word of the description; add it unless it is already there.
    if ((role === "killer" || role === "victim") && roleMarker(backstory) !== (role === "killer" ? "culprit" : "victim")) {
      backstory = `${role === "killer" ? words.killer : words.victim}\n\n${backstory}`.trim();
    }
    if (role === "victim") victims++;
    if (raw.clues !== undefined) {
      if (!Array.isArray(raw.clues) || raw.clues.some((c) => typeof c !== "string")) {
        problems.push(`${at}.clues must be a list of text`);
      } else {
        const clues = (raw.clues as string[]).map((c) => c.trim()).filter(Boolean);
        backstory = [backstory, ...clues.map((c, n) => `${words.clue} ${n + 1}: ${c.replace(/\n+/g, " ")}`)]
          .filter(Boolean)
          .join("\n\n");
      }
    }
    if (name) {
      if (byName.has(name.toLowerCase())) problems.push(`${at}.name "${name}" appears twice`);
      byName.set(name.toLowerCase(), characters.length);
    }
    characters.push({ name, description: backstory });
  });
  if (victims > 1) problems.push(`only one character can have role "victim" (found ${victims})`);

  const rawRounds = input.rounds === undefined ? [] : input.rounds;
  const introRounds: RoundText[] = [];
  const characterRounds: RoundText[][] = characters.map(() => []);
  if (!Array.isArray(rawRounds)) problems.push("rounds must be a list");
  else {
    rawRounds.forEach((raw, i) => {
      const at = `rounds[${i}]`;
      if (!isObject(raw)) {
        problems.push(`${at} must be an object`);
        return;
      }
      const number = i + 1;
      introRounds.push({
        number,
        title: text(raw.title, `${at}.title`).replace(/\n+/g, " ").slice(0, 80),
        text: text(raw.message ?? raw.public, `${at}.message`),
      });
      const each = raw.characters;
      if (each !== undefined && !isObject(each)) problems.push(`${at}.characters must map a character name to text`);
      for (const [name, value] of Object.entries(isObject(each) ? each : {})) {
        const index = byName.get(name.trim().toLowerCase());
        if (index === undefined) {
          problems.push(`${at}.characters: no character named "${name}"`);
          continue;
        }
        characterRounds[index].push({
          number,
          title: "",
          text: text(value, `${at}.characters.${name}`),
        });
      }
    });
  }

  const word = words.round;
  const composedIntro = joinRounds(intro, introRounds, word);
  if (composedIntro.length > MAX_INTRO) {
    problems.push(`intro and the rounds' messages together are ${composedIntro.length} characters; the limit is ${MAX_INTRO}`);
  }
  if (solution.length > MAX_SOLUTION) problems.push(`reveal is longer than ${MAX_SOLUTION} characters`);
  const composed = characters.map((c, i) => ({
    name: c.name,
    description: joinRounds(c.description, characterRounds[i], word),
  }));
  composed.forEach((c) => {
    if (c.description.length > MAX_DESCRIPTION) {
      problems.push(`"${c.name}": backstory and rounds together are ${c.description.length} characters; the limit is ${MAX_DESCRIPTION}`);
    }
  });

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    game: { title, language, intro: composedIntro, characters: composed, solution, rounds: introRounds.length },
  };
}

/** The inverse: a stored game as a whole-game file, so it can be edited elsewhere and imported again. */
export function exportGameFile(game: {
  title: string;
  language: Locale;
  intro: string;
  solution: string;
  characters: { name: string; description: string }[];
}) {
  const opening = splitRounds(game.intro);
  const people = game.characters.map((c) => {
    const { initial, rounds } = splitRounds(c.description);
    const marker = roleMarker(initial);
    // Drop the role word itself from the first line; the role field carries it.
    const backstory = marker ? initial.replace(/^[^\p{L}]*\p{L}+\s*/u, "").trim() : initial;
    return {
      name: c.name,
      ...(marker ? { role: marker === "culprit" ? "killer" : "victim" } : {}),
      backstory,
      rounds,
    };
  });
  const numbers = [
    ...new Set([...opening.rounds, ...people.flatMap((p) => p.rounds)].map((r) => r.number)),
  ].sort((a, b) => a - b);
  return {
    title: game.title,
    language: game.language,
    intro: opening.initial,
    characters: people.map(({ name, role, backstory }) => ({ name, ...(role ? { role } : {}), backstory })),
    rounds: numbers.map((n) => ({
      ...(opening.rounds.find((r) => r.number === n)?.title
        ? { title: opening.rounds.find((r) => r.number === n)!.title }
        : {}),
      message: opening.rounds.find((r) => r.number === n)?.text ?? "",
      characters: Object.fromEntries(
        people.flatMap((p) => {
          const r = p.rounds.find((x) => x.number === n);
          return r?.text ? [[p.name, r.text]] : [];
        }),
      ),
    })),
    reveal: game.solution,
  };
}
