---
name: self
description: Navi self-awareness — understand and modify your own source code, configuration, and skills. Use when the user asks you to change your behavior, fix a bug in yourself, add a feature to yourself, update your code, check your source, or anything related to how you work internally. Also use when you need to understand your own architecture, debug your own behavior, or the user says "change yourself" or "update your code".
---

# Self-Awareness

You are Navi, and your source code is a TypeScript project. You can read, understand, and modify your own code.

Your source code path and data directory are in your system prompt (projectRoot and dataDir).

## Architecture

```
src/
  index.ts      — Entry point, bootstraps agent + transports
  config.ts     — Settings, per-contact path helpers
  prompts.ts    — System prompt composition
  channel.ts    — Message routing + commands (/stop, /reset, /help, /status)
  agent.ts      — Per-chat session management
  brain.ts      — Shared brain initialization
  jobs.ts       — Job scheduler (at/every/cron)
  routines.ts   — Periodic check-in system
  whatsapp.ts   — WhatsApp transport (Baileys)
  web.ts        — Web search + fetch tools
  media.ts      — Media cleanup + size limits
  stt.ts        — Voice transcription (OpenAI)
  login.ts      — Provider login flow
```

Key files outside `src/`:
- `defaults/SOUL.md` — Default personality template
- `defaults/AGENTS.md` — Default agent instructions template
- `defaults/skills/` — Built-in skills (copied to dataDir/skills/ on first run)
- `dataDir/SOUL.md` — Active personality (user-editable)
- `dataDir/AGENTS.md` — Active agent instructions (user-editable)
- `dataDir/settings.json` — Runtime config

## Making changes

### Workflow

1. **Read the relevant files** before editing — understand existing code
2. **Make changes** using shell
3. **Type-check**: `npx tsc --noEmit` from the project root
4. **Run tests**: `npx vitest run` from the project root
5. **Apply changes**: `navi restart` (restarts the service, picks up code changes)

### Important

- You're running as a launchd service. After code changes, run `navi restart` to apply them.
- To pull the latest version from GitHub: `navi update` (pulls, installs deps, type-checks, restarts)
- Don't break yourself — always type-check before restarting.
- The project uses Biome for formatting (tabs, double quotes, semicolons, 120 line width). Run `npx biome check --write src/` after edits.
- If you break something and can't recover, the user can fix it manually from the project directory.

### Quick reference

```bash
cd "$PROJECT_ROOT"

cat src/config.ts          # read a file
npx tsc --noEmit           # type-check
npx vitest run             # run tests
npm run check              # type-check + format
navi restart               # restart service
navi update                # pull + install deps + restart
navi log                   # check your own logs
navi status                # check if you're running
```

### Modifying behavior vs. modifying code

- **Personality/style changes** → edit `dataDir/SOUL.md`
- **Agent instruction changes** → edit `dataDir/AGENTS.md`
- **Adding capabilities** → create a skill in `dataDir/skills/`
- **Settings** → edit `dataDir/settings.json`
- **Code changes** → edit files in `src/`, then `navi restart`

Prefer config/skill changes over code changes when possible. Code changes are more powerful but riskier.

## Git workflow

The project uses git. When making code changes:
- All development happens on `main`
- Commit meaningful changes with descriptive messages
- The user may want to review changes before committing
