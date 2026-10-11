# Prompt: write a mystery in the whole-game JSON format

Copy everything below the line into an AI chat, then add your brief (setting, guest names, tone,
language, number of rounds). Import the JSON it returns under Characters → "Import a whole game".

---

You are writing a murder-mystery party game. Reply with ONE JSON document and nothing else (no
Markdown fence, no commentary), in exactly this format:

```json
{
  "title": "Murder at the villa",
  "language": "en",
  "intro": "Saturday night at the mountain villa. Ivan has gathered his oldest friends for the weekend, and the storm has cut the road behind them.",
  "characters": [
    {
      "name": "Ivan",
      "role": "victim",
      "backstory": "You are Ivan, the host, and tonight you will be found dead in the study. You play the victim: the game master reads out your clues.",
      "clues": [
        "A key lies under the flowerpot on the terrace.",
        "The cellar smells of petrol."
      ]
    },
    {
      "name": "Ana",
      "role": "killer",
      "backstory": "You are Ana, Ivan's business partner. You have been skimming money from the company for two years, and Ivan found out this week. Your goal: make sure nobody opens the cellar."
    },
    {
      "name": "Bob",
      "backstory": "You are Bob, Ivan's brother. You owe Ivan a lot of money and you argued about it at dinner. You know Ana left the table at 22:10."
    }
  ],
  "rounds": [
    {
      "title": "The lights go out",
      "message": "At 22:15 every light in the villa goes out. When they come back, the study door is open and Ivan is on the floor.",
      "characters": {
        "Ana": "You slipped out in the dark. Make sure nobody finds out where you were.",
        "Bob": "In the dark someone brushed past you smelling of petrol. You could not see who."
      }
    },
    {
      "message": "The storm knocks out the phones. Nobody can leave, and somebody finds a key under the flowerpot.",
      "characters": {
        "Bob": "You saw Ana come back from the direction of the cellar. Decide whether to tell."
      }
    }
  ],
  "reveal": "Ana killed Ivan to hide the missing money, then tried to burn the ledgers in the cellar. The petrol smell and the key under the flowerpot lead to her."
}
```

Rules — the app reads the JSON mechanically, so follow them exactly:

1. `language` is `"en"` or `"bg"`; write every text in that language.
2. `intro` is the opening everyone hears (it is read aloud on a TV, so write it to be heard). It must
   not reveal the killer. Up to ~3000 characters.
3. `characters`: one per guest, `name` exactly as given. Exactly ONE character has `"role": "victim"`
   (played by the game master, never by a player); at least one has `"role": "killer"`. Everyone else
   has no `role`. Never write the words KILLER / VICTIM / УБИЕЦ / УБИТ inside any text yourself.
4. `backstory` is what that player knows at the start: who they are, their relationships, their
   secret, what they know, their goal. Plain text, blank line = new paragraph, no Markdown, up to
   ~3000 characters. Never reveal the killer to anyone but the killer.
5. The victim's `clues` is a list of short single-paragraph clues the game master reads out one at a
   time (no "Clue 1:" prefix — it is added). Other characters have no `clues`.
6. `rounds` is a list (as many as asked, default 3), in order. Each round:
   - `message`: PUBLIC — what every guest sees and hears in this round. Nothing private, nothing that
     names the killer. Written to be announced on a TV.
   - `title`: optional short title.
   - `characters`: an object mapping a character name (exactly as in `characters`) to what ONLY that
     character learns in this round: what they observed, what happened to them, what they should do
     next. Open-format text. Give most characters something every round; leave a name out if they
     have nothing new. Never include the victim here. A round may only rely on the backstories and
     earlier rounds.
7. `reveal` is the great reveal shown at the very end: what really happened and how the clues and
   rounds point to the killer. The story must be solvable from what the players are given.
8. Names, places, times and amounts must be consistent across the intro, backstories, rounds and the
   reveal. Each text field must stay under ~3000 characters (a character's backstory plus all of
   their round texts must stay under 8000 characters in total; the intro plus all round messages
   under 10000).
