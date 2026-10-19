# WriterOS status

Last rewritten: 2026-10-19. Rewrite this page in place when work lands; don't add to the bottom.

## Live

WriterOS is the home for a project's canon and its script. The live app (port 5177) includes:

- **Pages written by Morgan:** Synopsis, Treatment, Outline and Story Bible.
  Morgan writes or revises a page when asked, and asks only about what canon is missing.
- **Story Facts:** the story's facts in sections you can edit in place, with a "Still open" list.
- **Beat Sheet:** shows beats from Story-drive only. A project with no link shows an empty state.
- **Link to Story-drive:** two clicks connect a project to its Story-drive folder and bring in
  that folder's canon once. Your click counts as approval.
- **Long Story-drive decisions arrive whole.** Decisions longer than 8,000 characters used to be
  cut off when they came in from Story-drive. As of today they come in complete, and the three
  that had been cut (both pilot beat sheets and one shorter decision) were restored in full.
- **A decision replaced in Story-drive stops being canon in WriterOS.** The replaced pilot beat
  sheet in one project had stayed active; it is now kept as history only.
- **Looks** and **canon appeals:** looks are decided in the Look panel; canon changes only when
  you approve them. The Look panel speaks plainly: after you promote it says "Saved to canon."
  and "Open Front Lot to lock and sign this look.", and it no longer shows hashes, ids or
  OpenMontage. The look's id field is now called "Short name".
- **Work-loss fixes and ten smaller fixes** from the Oct 16 reviews (Morgan's folder-trust
  answer, readable chat formatting, saves no longer crossing between projects).

## Open

- One Story-drive project has no beat sheet yet and needs one made in Story-drive before it
  can be linked.
- When you type to Morgan from any page in Pages, she's told you're on Treatment. The
  "Write it with Morgan" button sends the right page. Known, not fixed.
- Two small wording slips: the Story Facts clear button reads "clear the whole Story Facts",
  and Morgan's instructions say "the Story Facts's Looks section". Known, not fixed.
- A decision that Story-drive marks as replaced, if its replacement note were itself longer
  than 8,000 characters, would still come in cut short. No project has one. Known, not fixed.
- The old Cursor rules file describes the original prototype and is stale.
- #84 (Morgan asks before she sends, signs or deletes through your connected apps) is waiting
  on your decision.
- Older pull requests still open and not being worked on: #55, #67.

## Next

- **Script export:** save the script as PDF (with its title page) and as Final Draft (FDX),
  from the Script toolbar.
