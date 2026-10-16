# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One writer: Ben, a film and TV writer running Not Boring. He works on his Mac, in long sessions, developing a series or film from decided story into pages. He is not an engineer and never wants to use a terminal inside WriterOS.

## Product Purpose

WriterOS is the home for a project's canon and its script. It sits between Story-drive (where story decisions are made) and Front Lot (where the film is produced). Canon holds the facts; pages hold the writing. Success is a writer who can see what is decided, write the script with Morgan beside him, and get any development document he needs without re-answering what canon already knows.

## Positioning

Canon-first writing. Every page and every agent works from one ratified canon, and canon changes only with the writer's explicit yes. Morgan, the writing partner, knows which document she is writing, asks only what canon does not already answer, and names any clash with what is already decided.

## Operating Context

- Story-drive decides; WriterOS keeps canon and the script; Front Lot produces. Beat sheets and decisions arrive from Story-drive; looks are promoted in WriterOS and signed in Front Lot.
- Morgan is a Claude Code session working in the project's Story-drive folder and WriterOS package. She proposes page changes; the writer keeps or dismisses them.
- Projects are folder packages under `~/WriterOS Projects`; the live app runs on port 5177 from `~/WriterOS-Prod`.

## Capabilities and Constraints

- The canon system (project memory ledger, promote / ratify / lock, Story-drive appeals, beat sheet sync, look promotion, the wayfinder import) is established and must not change behaviour. UI may change around it.
- Development documents (Synopsis, Treatment, Outline) are written by Morgan on request, in that format, from canon. They hold writing, never their own copy of canon facts.
- The writer's voice profile and Writers' Room live on their own page about the writer, so agents can work with him better.
- Script export (PDF, FDX) is required; none exists yet.

## Brand Commitments

- App names are the writer's: WriterOS, Story-drive, Front Lot, Morgan. Never "Backlot" or "wayfinder" in UI.
- Plain language in every label. No engineering words (JSON, mapping, IDs) on screen.
- Never use the writer's story or character names in code, tests or fixtures.

## Product Principles

1. Canon first: ask nothing canon already answers.
2. Economy: every question names the gap it fills; every control names the job it does.
3. The page is the work: chrome recedes, the writing gets the space.
4. Nothing changes canon without an explicit yes.
5. Never lose the writer's work, and never claim a save that has not happened.
