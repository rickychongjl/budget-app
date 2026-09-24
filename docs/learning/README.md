# Learning path

How I am learning the stack this app is built on, by following one everyday action (adding a $12 coffee) from the
tap on my phone to the database and back. Each hop is one technology, learned when I reach it.

## The path

| # | Sitting | Topic | Status |
|---|---|---|---|
| 0 | [Run it](00-run-it/) | Docker as a user: start the whole app locally | Done (2026-09-23) |
| 1 | [React](01-react/) | Components, props, state. **First:** the react.dev tic-tac-toe tutorial, outside this app | Not started |
| 2 | [Outbox and Dexie](02-outbox-dexie/) | Why a saved transaction does not go straight to the server | Not started |
| 3 | [.NET API](03-dotnet-api/) | Minimal APIs, dependency injection, EF Core, the four projects | Not started |
| 4 | [Domain rules and tests](04-domain-tests/) | Where "over budget" is decided; test first | Not started |
| 5 | [TanStack Query and the overlay](05-tanstack-overlay/) | Why the total moves before the server answers | Not started |
| 6 | [Docker properly](06-docker/) | The Dockerfile and compose file, line by line | Not started |
| 7 | [Service worker and PWA](07-pwa/) | Opening offline, installing on the phone | Not started |
| 8 | [Playwright](08-playwright/) | The user stories as browser tests | Not started |
| 9 | [Bicep and deploy](09-bicep-deploy/) | How a push to `main` goes live | Not started |

Sittings 1 to 5 are the code I will touch most. The rest is scaffolding around it, so it comes later.

## How a sitting works

1. **Predict first.** Say how I think it works before opening the file.
2. **Read the real file**, not a tutorial example. Ask about any line.
3. **Watch it happen**: DevTools (Network, Application), a test run, the logs.
4. **Change one small thing myself**, typed by me: rename a button, add a log line, break a test on purpose.
5. **Official docs only when stuck.**
6. **One concept per message, then stop.** I decide when to go further. For a new framework, learn the basics on a
   toy example first; this app's files use several ideas at once and are too dense as a first contact.

When a sitting is done, its folder's `notes.md` gets the critical points, in my words where I can.

## Habits

- Ask to be quizzed, not just told ("ask me three questions about `outbox.ts`").
- These notes are the raw material for the portfolio README later.
- To go deeper, make one real change that touches every layer (e.g. a note field on a transaction).

## Docs, when stuck

| Topic | Where |
|---|---|
| React | react.dev, "Learn": *Describing the UI*, *Adding Interactivity* |
| .NET | learn.microsoft.com: Minimal APIs tutorial, EF Core getting started |
| Docker | docs.docker.com, "Get started" |
| TanStack Query | tanstack.com/query: *Overview*, *Important Defaults* |
| Dexie | dexie.org, "Getting started" |
| PWA / service workers | web.dev, "Learn PWA" |
| Playwright | playwright.dev, "Getting started" |
| Bicep | learn.microsoft.com, "Fundamentals of Bicep" learning path |
