# WriterOS: Beat Sheet and Lookbook

Written 29 September 2026 for Claude Code and Codex. Plan it before touching anything, review it against the real show packages, and deploy only with every script package backed up first. Ben approves the plan before any code is written.

## What Ben wants, in his words

The Outline page stops pretending to be an outline. What WriterOS receives from Story-drive is a **beat sheet**, so it is called that, it is read-only in WriterOS, and it stays current with Story-drive by itself. The template questions in the middle of the page go away and are replaced by a **Lookbook**: visual questions born from the ratified beats, about what the camera sees. What does the cold open look like? What does Sunday dinner look like? Is Sal's kitchen a literal kitchen, and what's in it? A beat with nothing to see gets no question. The Lookbook never challenges canon; it builds the visuals from it.

The page keeps living where the Outline page lives today. That is the least painful version.

## Ground rules

- **One direction only.** Story-drive decides, WriterOS receives. Nothing in WriterOS edits a ratified beat.
- **Rename what Ben sees, not the files.** The screens say Beat Sheet and Lookbook. The underlying document can keep its current name, so nothing that already reads it breaks.
- **No script package is changed except the beat list itself, and only by the import.** Everything else in a package must come out byte-identical.
- **Backup first, every time.** A fresh copy of every script package is made the day of the deploy, before the deploy.
- **Plain words on the card.** Before landing, one sentence per live show (Dog Years, Yes Chef!, Bloodless, Grave Affairs) saying what this change does to it.

## What exists today (verified by reading the live app and Ben's files, 29 September)

1. **Grave Affairs is the only show with a ratified beat sheet.** It lives in Story-drive as one resolved decision, "Lay the pilot beat sheet," in the Grave Affairs ledger. Under its Answer is a "Playing order" section with fourteen numbered beats, each starting with a bold title (cold open through the breakfast tag), followed by other sections: the ticket's named questions, changes recorded, and a handoff note.
2. **Every other show carries the app's eight empty template beats.** Bloodless, Yes Chef, PSYOP (series) and all the features. Stool Pigeon's fifteen ratified beats exist only in WriterOS's own canon notes, not in a Story-drive ledger, because Stool Pigeon has no ledger. It is parked.
3. **Grave Affairs' fourteen beats reached WriterOS by hand.** An agent typed them into the outline document. There is no live link. If a beat changes in Story-drive, WriterOS never hears about it.
4. **The Wayfinder import is manual.** It is a Terminal command with preview and apply steps, not something that runs when a project opens. WriterOS's canon is only as fresh as the last time someone remembered to run it.
5. **The import doesn't know a beat sheet from any other decision.** It turns each resolved decision into one canon statement. It never reads the Outline and never splits a decision into beats. As far as a read of Grave Affairs' canon shows, the beat sheet decision may not be in WriterOS's canon at all.
6. **For series, the middle of the page and the beat list are unrelated.** The middle asks fixed series questions (what keeps generating stories, the season question, where it turns, what episode one promises) and saves the answers as series notes. The beat list on the left reads the outline document. Neither feeds the other. The beat list cannot be edited.
7. **A fix to the import is already written and unmerged** (it stops a "see the other decision" cross-reference importing as canon, and stops already-decided rows showing as open). It is in the development copy only, waiting for your review. Sequence this work after it or fold it in.

## The build

### 1. Beat Sheet, fed from Story-drive

- The import recognizes a beat-sheet decision and reads its playing order as individual beats: title, and the full text under it. Decide how a decision declares itself a beat sheet. Recommendation: an explicit marker in the decision file's header, rather than guessing from the title, so any show can adopt it and nothing is picked up by accident.
- The beats are written into the beat list, **matched by beat identity, not position.** A beat that moves keeps its identity. Propose how identity is kept stable across edits in Story-drive (a short stable key per beat in the ledger is the obvious answer; say what it costs to add one to Grave Affairs' existing decision without changing its meaning).
- The beat list is read-only in WriterOS. Because nobody can edit it there, the import may replace it freely.
- Shows without a ratified beat sheet keep what they have today. The empty template beats are not deleted or rewritten by this work.

### 2. It stays current without anyone remembering

This is the piece that fixes the actual worry. Without it, the rest is a nicer hand copy.

Options for reviewers to weigh and recommend one:
- Refresh when a project opens.
- A visible "Refresh from Story-drive" button on the page, with a plain line saying when it last refreshed and whether Story-drive has changed since.
- Both.

**Your key question:** does refreshing on open mean the app writes to the script package every time Ben opens a show? Opening Grave Affairs tonight rewrote every file in its package with identical content except the last-opened time and the analysis queue. Say whether a refresh adds real writes, what happens if Story-drive is mid-sync in iCloud when the app reads it, and what happens if the ledger file is malformed. A failed or partial read must leave the existing beat list untouched and say so plainly.

### 3. Lookbook, replacing the template questions

- The middle of the page shows visual questions per beat, only where a beat earns one. Target three to five per beat, not twenty.
- Questions are about what the camera sees: place, time, light, what's in the room, wardrobe, the one image that tells you who these people are, and objects a later beat pays off (Grave Affairs' widow's flower arrangement and the laminated lists are the model).
- Ben answers in his own words. No menus of options to pick from.
- **Answers hang off a beat, not a position.** If a beat is rewritten or cut in Story-drive, its answers are flagged as orphaned and shown, never silently deleted or moved to the wrong beat.
- Answers are working notes, not canon. They are not written back into Story-drive. Say where they are stored in the package.
- Decide who writes the questions (a room persona, on request, per beat) and how Ben asks for more or dismisses one. Recommendation: generated on request per beat, never automatically for all fourteen, so the page doesn't fill with noise.
- Longer term, these answers feed Front Lot's visual bible, which has approved characters and no approved locations. Out of scope for this build; don't block it.

### 4. The names

- The page and its sections say **Beat Sheet** and **Lookbook**. "Outline" disappears from what Ben sees.
- The underlying document and field names stay as they are unless you find a strong reason, stated plainly, to change them.
- A real scene-by-scene outline, between the beat sheet and the script, does not exist in WriterOS and is not part of this build.

## What we want back before any code

1. A plan, in plain English, with each step and what it touches.
2. Answers to the key question in section 2.
3. What this does to each of the four live shows, one sentence each.
4. The rollback: what restores the app, and confirmation the script packages are covered by the day's backup.
5. Anything in this spec you think is wrong. Say so; don't build around it.
