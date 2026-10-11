---
description: Generate a murder mystery for a list of guests and upload it as a new game
argument-hint: Ivan, Iva, Theo, Maria [--victim Ivan] [--lang en|bg] [--notes "…"] [--title "…"]
allowed-tools: Bash(npm run mystery:*)
---

Generate a mystery for: $ARGUMENTS

Run `npm run mystery -- <arguments>` once, passing the arguments above through (quote `--notes`
and `--title` values). Use a 10-minute timeout (600000 ms): generation takes several minutes.

The person running this may play the game, so keep it blind:
- Don't open, read, cat or summarize anything under `generated/`, and never show character
  descriptions, the intro or the solution.
- Report only what the script printed: the game code, the character names, the checks, and the
  two links. Give the creator link as-is; it works like a password.

If the script fails, show its error and stop. Don't write the story yourself.
