# Navi

Personal messaging assistant powered by Pi's coding agent SDK (`@mariozechner/pi-coding-agent`).
Messages from WhatsApp (and future channels) route to per-contact agent sessions with shell access, shared brain, and Pi's extensibility.

## Architecture

Three-layer design for channel-agnostic messaging:

```
Transport (whatsapp.ts)  →  Channel (channel.ts)  →  Agent (agent.ts)
creates ChannelContext       commands + routing        session management
```

- **Transport** — channel-specific connection, creates a `ChannelContext` per message
- **Channel** — shared command handling (`/stop`, `/reset`, `/status`, `/help`) and agent routing
- **Agent** — Pi SDK session management, one session per contact ID, channel-agnostic

To add a new channel: create a transport that produces a `ChannelContext`, wire it in `index.ts` with `handleMessage`.

## Source files

```
src/
  index.ts      — Entry point, bootstraps agent + transports
  config.ts     — Settings, per-contact path helpers
  prompts.ts    — System prompt composition and event prompts
  channel.ts    — ChannelContext interface, handleMessage(), commands
  agent.ts      — Per-chat session management, chat(), abortSession(), resetSession()
  brain.ts      — Shared brain initialization (GLOBAL.md) and history seeding
  jobs.ts       — Job scheduler: at/every/cron with persistence + agent tool
  routines.ts   — Periodic check-in: scans all contacts for ROUTINES.md
  whatsapp.ts   — Baileys WhatsApp transport, media + outbox per chat
  web.ts        — Web search (Brave) and web fetch tools
  stt.ts        — Voice message transcription via OpenAI
  login.ts      — Interactive provider login

defaults/
  SOUL.md       — Default personality (copied to ~/.navi/ on first start)
  AGENTS.md     — Default agent instructions (copied to ~/.navi/ on first start)
```

## Key concepts

- **Model format**: `"provider/model"` (e.g. `"anthropic/claude-sonnet-4-6"`)
- **Sessions persist** across restarts via `SessionManager.continueRecent()`
- **WhatsApp delivers offline messages** on reconnect — no backfill needed
- **Config** lives at `~/.navi/settings.json`, data at `~/.navi/`
- **SOUL.md + AGENTS.md** at `~/.navi/` define personality and agent instructions. Seeded from `defaults/` on first start. Uses `{{placeholder}}` syntax for dynamic paths.
- **Shared brain** at `~/.navi/brain/` — GLOBAL.md always loaded, other files read on demand via shell. Agent self-organizes by person/topic.
- **Baileys** must be installed from GitHub (`github:WhiskeySockets/Baileys`), not npm (stale)

## Commands

```
npm run dev     — Run with tsx
npm run build   — Compile TypeScript
npm run check   — Type-check + format (biome --write)
npm run ci      — Type-check + lint (no write)
npm run login   — Log in to an AI provider
```

## Formatting & linting

- Biome with tabs, 120 line width, double quotes, semicolons
- Claude Code hooks auto-format `.ts` files on Write/Edit
- Pre-commit hook runs `npm run ci` before any git commit

## Git workflow

- **All development happens on `main`**
- **Tag releases** with `v*` (e.g. `v0.2.0`) — triggers GitHub Release workflow

## Workflow preferences

- **KISS & YAGNI** — minimal code for current requirements, no speculative abstractions
- **Commit in meaningful slices** — one logical change per commit, not one big blob
- **Read before edit** — always read existing code before modifying
- **Type-check before commit** — `npx tsc --noEmit` must pass
- **No `.js` in imports** — using `moduleResolution: "bundler"` with tsx
- **No unnecessary docs/comments** — code should be self-explanatory
- **Ask before over-engineering** — don't add features, refactors, or abstractions beyond what's requested
- **Big changes: plan → implement → review → commit** — use `/plan` for non-trivial work, implement, self-review for bugs/edge cases, then ask to commit
- **Always ask to commit** — after completing a meaningful change, ask if the user wants to commit
- **NEVER commit personal data** — no code, skills, configs, or any file may contain personal information (home addresses, coordinates, room layouts, folder/list names, credentials, API keys, tokens, hostnames, IP addresses). Use generic examples and discovery commands instead. Review all changes before committing.
