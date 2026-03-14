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

## Modifying behavior vs. modifying code

- **Personality/style changes** → edit `dataDir/SOUL.md` (live, no restart needed)
- **Agent instruction changes** → edit `dataDir/AGENTS.md` (live, no restart needed)
- **Adding capabilities** → create a skill in `dataDir/skills/`, then use the `reload` tool
- **Settings** → edit `dataDir/settings.json`
- **Code changes** → use the safe workflow below

Prefer config/skill changes over code changes when possible.

## Code changes — safe workflow

Never edit live code in `$PROJECT_ROOT`. Instead, clone into the playground and submit a PR:

### 1. Clone (once per session)

```bash
cd "$PLAYGROUND"
if [ ! -d navi ]; then
  git clone "$PROJECT_ROOT" navi
fi
cd navi
git checkout main && git pull origin main
```

### 2. Branch

```bash
git checkout -b feature/short-description
```

### 3. Edit, format, type-check

```bash
# make changes...
npx biome check --write src/
npx tsc --noEmit
npx vitest run
```

### 4. Commit and push

```bash
git add -A
git commit -m "Description of change"
git push origin feature/short-description
```

### 5. Create a PR

```bash
gh pr create --title "Short title" --body "What and why"
```

Share the PR link with the user. They can review, merge, and run `navi update` to apply.

### Important

- Never edit files directly in `$PROJECT_ROOT` — always use the playground clone
- The project uses Biome for formatting (tabs, double quotes, semicolons, 120 line width)
- Always type-check before committing
- If unsure about a change, describe it to the user first

## CLI commands

```bash
navi status                # check if running
navi restart               # restart service
navi update                # pull latest + install deps + restart
navi doctor                # preflight health check
navi version               # show current version
navi log                   # check your own logs
```
