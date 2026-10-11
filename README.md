# 🕯️ Mystery — web mystery party game

A self-hosted web app for running a murder-mystery party. Whoever creates a game is the **game
master**: they write the characters (each one a player: name + backstory), then any number of
**rounds**, and run the evening. Players join with a 6-character code, pick a character, and see
**only their own** card. As the game master releases each round, every character receives
round-specific information, and a **public message** can be announced on a TV (the presenter, read
aloud with ElevenLabs and shown as large subtitles). Then voting, and finally the solution. Each
mystery is written in one language and each player reads it in their own: missing translations are
made with Claude and saved.

### Two kinds of people

| | Where | Sees | Can |
|---|---|---|---|
| **Game master** = the creator | `/gm/CODE` | everything: every backstory and round, the killer, the votes, the solution | write characters, the opening, rounds and solution; run phases, release rounds, start TV narration, the clue timer for the victim's clues |
| **Player** | `/game/CODE` | their own card (backstory + the rounds released so far), the opening and released public messages, the cast list | pick a character, vote |

The victim character is played by the game master, so no player can pick it. Requests from the
creator's page carry `?as=creator` for state, so a browser that is both never mixes the two up.

---

## How it plays

| | |
|---|---|
| **1. Preparation** | The creator makes a game (choosing the language it is written in) and gets a 6-char code. They write each character's backstory, the opening story, and the rounds (the "Rounds" tab: a public message plus what each character learns). `.txt` import still works. |
| **2. Picking roles** | Players type the code, read the opening and pick a character. |
| **3. Game on** | The game master starts the game, releases the rounds one by one and starts each public message on the TV when the room is ready. |
| **4. Voting** | Each player accuses someone and optionally writes why. The game master watches the tally live. |
| **5. Reveal** | The solution, the real culprit(s) and the full vote tally become visible to everyone. |

A character is just a name and one free-text description (blank line = new paragraph) holding
everything the player needs — who they are, backstory, secret, goal.

**Uploading:** "📂 Upload .txt files" takes many files at once — one character per file. The file
name is the name (`Theo.txt` → Theo; a leading number only sets the order: `01 - Theo.txt` → Theo),
the contents the description. A file named like an existing character replaces its description
instead of adding a duplicate. `Intro.txt` and `Solution.txt` (or `Увод.txt` and `Решение.txt`) set
the intro and the solution (the creator can upload the solution but never read it back). UTF-8,
UTF-16 and Windows-1251 are all read correctly.

### Rounds

A description can continue after its starting text with any number of rounds. A line `Round 2` (or
`Рунд 2`, optionally followed by a title) alone on its line opens a round; everything up to the next
such line is free-form text for that player — what they observed, what happened to them, what to do.

```
You are Ana, the host's sister… (starting information)

Round 1
You saw Bob leave the study with a key.

Round 2: At the dock
Meet Ida at the dock before midnight and ask her about the letter.
```

The number of rounds is the highest round number in any description; a character with no text for a
round just has nothing new. Players only ever receive the rounds the host has released: while the
game is on, the host's dashboard has "Release round N" (and "Take back round N"). Rounds are written in the "Rounds" tab (the text format above is what it stores and what `.txt`
import reads). Stored in `games.current_round`.

### Presenter (TV)

`/present/CODE?k=KEY` is a full-screen view for a TV: the title, the join code while players arrive,
the current round, and — when the host starts it — a part of the story read aloud with large
subtitles that follow the voice. The link's secret key (shown to the host as "Open the presenter" /
"Copy the TV link") is the only thing that lets the TV in; it sees nothing but public text. Add
`&lang=bg` to force a language. The TV needs one click on first load to be allowed to play sound.

What it reads is the **intro**: the text before the first `Round N` line is the opening, and each
`Round N` section is the public part for that round. Players see released parts in their Story tab.
In the host dashboard, releasing a round only unlocks its part — the host then presses
"▶ Round N" to start the narration when the room is ready (again to replay, "■ Stop" to stop).
Audio is ElevenLabs (cached like the other narration); without a key the subtitles run at reading pace.
State: `games.present_token`, `narration_segment`, `narration_seq`.

### The victim and the clue timer

Killer and victim aren't chosen with a switch — they are read from the **first word of the
description** (any letter case, leading emoji ignored). The words of every supported language are
recognised in every mystery (`MARKERS` in `src/lib/format.ts`):

| First word | Means |
|---|---|
| `KILLER` (also `MURDERER`, `MURDERESS`) · `УБИЕЦ` (also `УБИЕЦЪТ`, `УБИЙЦА`, `УБИЙЦАТА`) | 🔪 the killer — shown to everyone at the reveal |
| `VICTIM` · `УБИТ` (also `УБИТИЯТ`, `УБИТА`, `УБИТАТА`) | ☠️ the victim — there should be exactly one |

The flags are recomputed every time a description is saved (and once on boot). The creator only
learns *that* a victim and a killer were recognised, never who the killer is.

The player who picks the victim is the host: they see their own card under "☠️ My role", every
other card under "Characters", and can't be accused or vote.

Clues live in the victim's description — every paragraph that starts with "Clue" (or "Улика"):

```
Clue 1: There's a key to the cellar under the flowerpot on the terrace.

Clue 2: The cellar smells of petrol.
```

When the host moves the game to "Game on", a 25-minute timer starts on their screen (it is
never sent to anyone else). When it runs out it chimes, vibrates, keeps the screen awake and shows the
next clue; "✓ I read it" starts the next 25 minutes. "Read early" stops the countdown to read
a clue before time. The timer is kept on the server, so a refresh doesn't lose it. The interval is `CLUE_INTERVAL_MS` in `src/lib/format.ts`.

The host's character editor has a **👁️ Preview** button to see the rendered card before saving.

---

## Languages

Supported: **English** (the default) and **Bulgarian**. The 🌐 switcher at the top of every page
sets the `mm_lang` cookie; the UI *and* the story follow it.

- **UI:** every string lives in `src/lib/i18n/messages/en.ts`, with the same keys in `bg.ts` (the
  type checker refuses a missing key). Server error messages are keys too, translated into the
  caller's language when sent. To add a language, add it to `LOCALES` in `src/lib/i18n/locales.ts`,
  write its messages file and its marker words in `MARKERS` (`src/lib/format.ts`).
- **Mysteries:** each game has a `language` — the one it is written in, picked when it's created
  and changeable on the creator's page. Whoever reads it in another language gets a translation of
  the title, intro, solution and every character's name and description.
- **Translation** is lazy: the first time someone needs a language that is missing (or out of date
  after an edit), the server starts translating in the background with Claude and shows the
  original with a "Translating…" notice; the page's polling picks the translation up when it's
  saved. Names are translated first so every description spells them the same, then the
  descriptions in parallel. The marker words and `Clue N:` labels are rewritten into the target
  language, and if a translation ever comes back with a different number of clues, the timer
  falls back to the original clues.
- Translations are stored per language in `game_translations` / `character_translations` with a
  hash of the text they were made from, so editing a character only retranslates that character.
  Players aren't shown anything during setup, so nothing is translated until roles open.
- **Editing** always changes the original. The host reading a translation edits the original
  text (a note says so); translations follow on their own.
- Set `ANTHROPIC_API_KEY` to turn translation on (`TRANSLATION_MODEL` defaults to `claude-opus-5`;
  declined requests are retried server-side on Anthropic's recommended fallback model). Without the
  key everyone reads the original, with a notice saying so. A failed translation is retried after a
  minute.

---

## Stack

- **Next.js 16** (App Router) + React 19, TypeScript
- **SQLite via Node's built-in `node:sqlite`** — no native modules, nothing to compile
- Hand-written CSS, no UI framework
- Identity is cookie-based: no accounts, no passwords. The creator's browser holds the creator
  token; each player's browser holds a player token (the host is simply the player holding the
  victim). Clearing cookies loses access to that role.
- Clients poll `/api/games/:code/state` every 3–4s, so phase changes land without a refresh.
- No i18n library: a typed dictionary per language and a tiny `t()` (`src/lib/i18n`).
- Translation with the Anthropic SDK (`src/lib/translate.ts`, `src/lib/localize.ts`).

## Read-aloud (ElevenLabs)

Set `ELEVENLABS_API_KEY` and a **🔊 Listen** button appears next to the intro story (for everyone)
and next to the clue on the host's timer. Without the key the buttons simply don't show.

- Each distinct text is synthesized once and cached as an mp3 in `$DATA_DIR/tts/`, so ten phones
  replaying a clue cost one API call. Editing a text generates a fresh file on next play.
- Everyone hears the text in the language they read it in (`?lang=` on the audio routes).
- The next clue is synthesized in the background as soon as its 25 minutes start, so it plays
  instantly when it's due.
- Players can only fetch the intro, and only once the game has left setup. Clue audio is host-only.
- `ELEVENLABS_VOICE_ID` picks the voice (default: premade "George"); `ELEVENLABS_MODEL_ID`
  defaults to `eleven_multilingual_v2`, which reads every supported language. The intro is capped at 10 000
  characters, the model's per-request limit.

## Generating a mystery with Claude Code

Instead of writing the `.txt` files yourself, let your local Claude Code write the whole mystery
from a list of names — on your Claude subscription, no API key — and upload it as a new game:

```bash
# in Claude Code, from this repo:
/mystery Ivan, Iva Petrova, Theo, Maria --victim Ivan --notes "a birthday at a villa"

# or straight from the shell, written in Bulgarian:
npm run mystery -- Иван, Ива Петрова, Тео, Мария --victim Иван --lang bg
```

- **Your system prompt** lives in `prompts/mystery-generator.md` — style, tone, length, number of
  clues. The script adds the rules the app depends on (the language, one character per name,
  `VICTIM` / `KILLER`, `Clue N:` paragraphs — or their Bulgarian forms) on top of it.
- `--lang en|bg` picks the language the story is written in (default `en`); players reading another
  language get it translated by the app.
- It runs `claude -p` headless (structured JSON output, no tools, outside the repo so this
  project's `CLAUDE.md` doesn't leak in), creates a game on `MYSTERY_APP_URL` (default
  `https://mistery.tedraykov.me`; set it in `.env`, e.g. `http://localhost:3000` for dev), and
  uploads the characters, intro and solution.
- **It stays blind:** only the game code, the names, the checks (victim / killer / solution / intro
  recognised) and two links are printed. The first link — `/api/games/CODE/creator-login?key=…` —
  gives your browser creator access to the new game; it works like a password.
- A copy is kept in `generated/` (gitignored) in case the upload fails:
  `npm run mystery -- --from generated/<file>.json` re-uploads it. Don't open it if you're playing.
- Names with spaces: separate names with commas. `MYSTERY_MODEL` picks the model (`claude --model`).
- If `ANTHROPIC_API_KEY` is set in your shell, the script drops it for the child process so the
  run uses your subscription.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

The database is created automatically at `./data/mistery.sqlite` (override with `DATA_DIR`).

```bash
npm run typecheck
npm run build
npm start            # production check; warns about `output: standalone` — harmless here,
                     # the Docker image runs the standalone server instead
```

## Docker

```bash
docker compose up --build       # http://localhost:3000
```

The image is a three-stage build ending in `node:24-alpine` running Next's standalone output as
the non-root `node` user, with a `/api/health` healthcheck.

## Deploying on Dokploy

1. Create an **Application** pointing at this repo (or a **Compose** service using
   `docker-compose.yml`).
2. Build type: **Dockerfile** — not Nixpacks (Dokploy's default). Nixpacks ships an old Node,
   doesn't set `DATA_DIR` (so the database misses the volume), and bakes env vars — including
   `ELEVENLABS_API_KEY` — into the image as build args.
3. **Add a persistent volume** — this is the one thing that matters:

   | | |
   |---|---|
   | Mount path (in container) | `/app/data` |
   | Type | Volume mount |

   Without it the SQLite file lives in the container's writable layer and every redeploy wipes
   all games.
4. Environment variables (both already defaulted in the image, set them only if you change
   anything):

   ```
   DATA_DIR=/app/data
   PORT=3000
   ```

   Add `ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`) to enable read-aloud, and
   `ANTHROPIC_API_KEY` to translate mysteries into each reader's language.
5. Set the container port to **3000** and attach your domain. Dokploy's Traefik terminates TLS.
6. Health check path: `/api/health`.
7. **Keep replicas at 1.** One SQLite file wants one writer process; scaling horizontally would
   need a different database.

### Backups

The whole game lives in one file. To grab a copy:

```bash
docker cp <container>:/app/data/mistery.sqlite ./mistery-backup.sqlite
```

---

## API surface

All routes are cookie-scoped; the same URL returns a different payload to the creator
(`?as=creator`), the host and a player. Only the host's payload contains other characters'
descriptions or the killer. Players and the host get the story in the language of their `mm_lang`
cookie, with a `story` field saying whether it is the original, translated or being translated;
the creator always gets the original.

| Method | Route | Who |
|---|---|---|
| `POST` | `/api/games` | anyone → becomes the creator of the new game (`title`, `language`) |
| `POST` | `/api/games/:code/session` | anyone → joins as a player if not already known |
| `GET` | `/api/games/:code/state` | creator, host or player → role-aware view (polled) |
| `POST` | `/api/games/:code/claim` | player → claim / release a character (claiming the victim makes you host) |
| `POST` | `/api/games/:code/vote` | player → accuse (only during `voting`) |
| `DELETE` | `/api/games/:code/vote` | game master → clear the tally |
| `PATCH` | `/api/games/:code` | game master → title, intro, solution, `language`, `phase`, `round`, `narrate`, `clueRead`, `resetClues` |
| `GET` | `/api/games/:code/creator-login?key=…` | holder of the creator key → creator cookie, redirect to `/gm/CODE` |
| `POST` `PATCH` `DELETE` | `/api/games/:code/characters[/:id]` | creator or host |
| `GET` | `/api/games/:code/audio/intro?lang=` | creator, or a player once past setup → mp3 |
| `GET` | `/api/games/:code/audio/clue/:n?lang=` | game master → the victim's clue `n` as mp3 |
| `GET` | `/api/health` | anyone |

## Data model

`games` → `characters`, `players`, `votes`, `game_translations`; `characters` →
`character_translations`. `games.language` is the language the mystery is written in (games from
before languages existed are `bg`). The clue timer is two columns on `games`
(`clue_round_started_at`, `clues_read`); the victim is `characters.is_victim`. A player row holds a nullable
`character_id`; a unique index on it enforces that two people can't claim the same role.
Schema is applied idempotently on boot (`src/lib/db.ts`) — no migration step to run. Databases
from before the plain-text characters get their old sections (and role / pair lines) folded into
`description` once, on first boot.
