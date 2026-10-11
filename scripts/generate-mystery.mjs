#!/usr/bin/env node
/**
 * Generate a murder mystery with your local Claude Code (your subscription, not an API key) and
 * upload it as a new game.
 *
 *   npm run mystery -- Ivan, Iva, Theo, Maria [--victim Ivan] [--notes "the 90s, a mountain villa"]
 *   npm run mystery -- Иван, Ива, Тео --lang bg                # write it in Bulgarian
 *   npm run mystery -- --from generated/2026-09-27-….json      # re-upload a saved generation
 *
 * The story never goes to the terminal: whoever runs this may be playing. Claude Code runs
 * headless (`claude -p`) with the system prompt in prompts/mystery-generator.md, the result is
 * saved under generated/ and uploaded, and only the game code, names and links are printed.
 * `--lang` picks the language the story is written in (default English); players reading another
 * language get it translated by the app.
 *
 * Env: MYSTERY_APP_URL (default https://mistery.tedraykov.me), MYSTERY_PROMPT_FILE,
 *      MYSTERY_MODEL (passed to `claude --model`).
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = (process.env.MYSTERY_APP_URL || "https://mistery.tedraykov.me").replace(/\/+$/, "");
const PROMPT_FILE = path.resolve(
  ROOT,
  process.env.MYSTERY_PROMPT_FILE || "prompts/mystery-generator.md",
);

// The app reads these limits; see src/lib/textFile.ts and the game PATCH route.
const MAX_DESCRIPTION = 8000;
const MAX_INTRO = 10000;

// The words the app recognises in each language; keep in sync with MARKERS in src/lib/format.ts.
const LANGUAGES = {
  en: { name: "English", killer: "KILLER", victim: "VICTIM", clue: "Clue", round: "Round" },
  bg: { name: "Bulgarian", killer: "УБИЕЦ", victim: "УБИТ", clue: "Улика", round: "Рунд" },
};

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    solution: { type: "string" },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "intro", "solution", "characters"],
  additionalProperties: false,
};

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/* ── Arguments ──────────────────────────────────────────────────── */

function parseArgs(argv) {
  const opts = { names: [], victim: "", notes: "", title: "", from: "", lang: "en" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--victim") opts.victim = argv[++i] ?? "";
    else if (a === "--notes") opts.notes = argv[++i] ?? "";
    else if (a === "--title") opts.title = argv[++i] ?? "";
    else if (a === "--from") opts.from = argv[++i] ?? "";
    else if (a === "--lang") opts.lang = (argv[++i] ?? "").toLowerCase();
    else rest.push(a);
  }
  // "Ivan, Iva Petrova, Theo" keeps two-word names; without commas every word is a name.
  const raw = rest.join(" ");
  const parts = /[,\n]/.test(raw) ? raw.split(/[,\n]/) : raw.split(/\s+/);
  opts.names = [...new Set(parts.map((n) => n.trim().normalize("NFC")).filter(Boolean))];
  return opts;
}

/* ── Generation ─────────────────────────────────────────────────── */

/** The app parses the story mechanically, so these rules sit on top of your system prompt. */
function task({ names, victim, notes, lang }) {
  const L = LANGUAGES[lang];
  return `Create a murder mystery for these guests. Each guest gets exactly one character with the same name:
${names.map((n) => `- ${n}`).join("\n")}

${victim ? `The victim is ${victim}.` : "Choose which of the guests is the victim."}
${notes ? `\nNotes from the host:\n${notes}\n` : ""}
The app reads your answer mechanically, so these rules are mandatory and take precedence over everything else:
1. Write everything in ${L.name}.
2. \`characters\` has exactly one entry per guest, in the same order, with \`name\` copied exactly.
3. Exactly one character is the victim. Their \`description\` starts with the word "${L.victim}" alone on its first line. The player with this role runs the game: their description tells them they are the victim and the host, and holds the clues.
4. At least one character is the killer. Their \`description\` starts with "${L.killer}" alone on its first line. No other description starts with either of these two words.
5. The clues are paragraphs of the victim's description, each starting with "${L.clue} 1:", "${L.clue} 2:"… in the order they are read aloud — one every 25 minutes. Unless the system instructions say otherwise, write 6 clues. Each clue is one paragraph with no blank lines inside. No other paragraph starts with "${L.clue}".
5b. Rounds: after its starting text, every description continues with 3 rounds unless the system instructions say otherwise. A round opens with a line "${L.round} 1", "${L.round} 2"… alone on its line, followed by free-form paragraphs addressed to that player: what they did and observed during this round, what they learn, and what they should do next. The host releases the rounds one at a time, so a round must only rely on information from the starting text and earlier rounds. Every character has the same number of rounds. No other line starts with "${L.round}" followed by a number.
6. Every description is plain text — paragraphs separated by a blank line, no Markdown — up to 7000 characters. It is all the player reads: who they are, their secret, what they know and their goal.
7. \`intro\` is the story everyone reads at the start (plain text, up to 9000 characters). It doesn't give away the killer. It is read aloud on a TV, so write it to be heard. After the opening it continues with one public part per round — "${L.round} 1", "${L.round} 2"… alone on a line, same count as the characters' rounds — which everyone hears when that round starts: what happens that all the guests witness (never anything private or revealing the killer).
8. \`solution\` is revealed at the end: what really happened and how the clues point to the killer.
9. \`title\` is a short title for the mystery.`;
}

async function generate(opts) {
  let system;
  try {
    system = readFileSync(PROMPT_FILE, "utf8");
  } catch {
    fail(`No system prompt at ${path.relative(ROOT, PROMPT_FILE)}.`);
  }
  if (!system.trim()) fail(`${path.relative(ROOT, PROMPT_FILE)} is empty.`);

  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(SCHEMA),
    "--system-prompt-file", PROMPT_FILE,
    "--tools", "",
    "--no-session-persistence",
  ];
  if (process.env.MYSTERY_MODEL) args.push("--model", process.env.MYSTERY_MODEL);

  const env = { ...process.env };
  // Running from inside Claude Code: let the child start its own session.
  delete env.CLAUDECODE;
  // An API key would take precedence over the subscription login — this runs on the subscription.
  delete env.ANTHROPIC_API_KEY;

  console.error("✍️  Claude is writing the mystery (usually 2–6 minutes)…");
  const started = Date.now();
  const ticker = setInterval(() => {
    console.error(`   …${Math.round((Date.now() - started) / 1000)}s`);
  }, 30_000);

  // Run outside the repo so the project's CLAUDE.md and settings don't leak into the story.
  const child = spawn("claude", args, { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(task(opts));
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const exitCode = await new Promise((resolve) => {
    child.on("error", (e) => {
      err += e.message;
      resolve(-1);
    });
    child.on("close", resolve);
  });
  clearInterval(ticker);

  let result;
  try {
    result = JSON.parse(out);
  } catch {
    fail(`claude returned no result (exit code ${exitCode}).\n${err.trim() || out.trim()}`);
  }
  if (result.is_error || result.subtype !== "success" || !result.structured_output) {
    fail(`Generation failed: ${result.subtype ?? ""} ${result.result ?? err}`.trim());
  }
  console.error(`   done in ${Math.round((Date.now() - started) / 1000)}s`);
  return result.structured_output;
}

/** Every guest must have a character, named exactly as given. */
function matchNames(story, names) {
  const byName = new Map(story.characters.map((c) => [c.name.trim().toLowerCase(), c]));
  const missing = names.filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length > 0) {
    fail(`The story has no characters for: ${missing.join(", ")}. Run the generation again.`);
  }
  return names.map((n) => ({ name: n, description: byName.get(n.toLowerCase()).description }));
}

/* ── Upload ─────────────────────────────────────────────────────── */

async function call(url, init, what) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    fail(`${what}: can't reach ${APP_URL} (${e.message}).`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    fail(`${what}: ${res.status} ${body.error ?? res.statusText}`);
  }
  return res;
}

async function upload(story, characters, lang) {
  const json = { "content-type": "application/json" };

  const created = await call(
    `${APP_URL}/api/games`,
    {
      method: "POST",
      headers: json,
      body: JSON.stringify({ title: story.title, language: lang }),
    },
    "Creating the game",
  );
  const { code } = await created.json();
  const cookie = created.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith(`mm_gm_${code}=`));
  if (!cookie) fail("The server returned no creator key.");
  const key = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
  const headers = { ...json, cookie };

  for (const c of characters) {
    await call(
      `${APP_URL}/api/games/${code}/characters?as=creator`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: c.name, description: c.description.slice(0, MAX_DESCRIPTION) }),
      },
      `Uploading “${c.name}”`,
    );
  }
  const setup = await (
    await call(
      `${APP_URL}/api/games/${code}?as=creator`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          intro: story.intro.slice(0, MAX_INTRO),
          solution: story.solution.slice(0, MAX_DESCRIPTION),
        }),
      },
      "Uploading the intro and the solution",
    )
  ).json();

  return { code, key, setup };
}

/* ── Main ───────────────────────────────────────────────────────── */

const opts = parseArgs(process.argv.slice(2));
let story;
let savedTo;

if (opts.from) {
  try {
    const saved = JSON.parse(readFileSync(path.resolve(opts.from), "utf8"));
    ({ story, names: opts.names } = saved);
    // Copies saved before languages existed are Bulgarian.
    opts.lang = saved.lang ?? "bg";
  } catch (e) {
    fail(`Can't read ${opts.from}: ${e.message}`);
  }
  savedTo = opts.from;
} else {
  if (!LANGUAGES[opts.lang]) {
    fail(`Unsupported --lang "${opts.lang}". Use one of: ${Object.keys(LANGUAGES).join(", ")}.`);
  }
  if (opts.names.length < 3) fail("Give at least 3 names, e.g.: npm run mystery -- Ivan, Iva, Theo");
  if (opts.victim && !opts.names.some((n) => n.toLowerCase() === opts.victim.toLowerCase())) {
    fail(`“${opts.victim}” isn't in the list of names.`);
  }
  story = await generate(opts);
  if (opts.title) story.title = opts.title;

  // Keep a copy in case the upload fails (re-upload with --from). Don't open it if you're playing.
  const dir = path.join(ROOT, "generated");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  savedTo = path.join(dir, `${stamp}.json`);
  writeFileSync(savedTo, JSON.stringify({ names: opts.names, lang: opts.lang, story }, null, 2));
}

const characters = matchNames(story, opts.names);
const { code, key, setup } = await upload(story, characters, opts.lang);

const victim = setup.characters.find((c) => c.isVictim)?.name;
const check = (ok, label) => `${ok ? "✓" : "⚠️"} ${label}`;
console.log(`
✓ “${setup.game.title}” is created (${LANGUAGES[opts.lang].name}) — code ${code}

Characters (${setup.characters.length}): ${setup.characters.map((c) => c.name).join(", ")}
${check(setup.victimCount === 1, victim ? `victim: ${victim} (runs the game)` : `victims: ${setup.victimCount}`)}
${check(setup.culpritCount > 0, `killer: ${setup.culpritCount > 0 ? "recognised" : "missing"}`)}
${check(setup.hasSolution, "solution")}  ${check(setup.game.intro.trim() !== "", "intro")}

Open as the creator (only you — the link works like a password):
  ${APP_URL}/api/games/${code}/creator-login?key=${encodeURIComponent(key)}
Link for the players:
  ${APP_URL}/game/${code}

Copy: ${path.relative(ROOT, savedTo)} (don't open it if you're playing)`);
