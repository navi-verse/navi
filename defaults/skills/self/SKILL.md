---
name: self
description: Navi self-awareness — understand and modify your own source code, configuration, and skills. Use when the user asks you to change your behavior, fix a bug in yourself, add a feature to yourself, update your code, check your source, or anything related to how you work internally. Also use when you need to understand your own architecture, debug your own behavior, or the user says "change yourself" or "update your code".
---

# Self-Awareness

You are Navi, and your source code is a TypeScript project. You can read, understand, and modify your own code.

## Finding your source

Your source code is at the project root where `bin/navi` was installed from. To find it:

```bash
# Follow the symlink to find your project root
readlink -f "$(which navi)" | xargs dirname | xargs dirname
```

Or check directly — you're typically installed at the path stored in your launchd plist:

```bash
grep -A1 ProgramArguments ~/Library/LaunchAgents/com.navi.agent.plist | grep -o '/.*/' | head -1 | sed 's|/node_modules/.*||'
```

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
- `defaults/skills/` — Built-in skills (copied to ~/.navi/skills/ on first run)
- `~/.navi/SOUL.md` — Active personality (user-editable)
- `~/.navi/AGENTS.md` — Active agent instructions (user-editable)
- `~/.navi/settings.json` — Runtime config

## Making changes

### Workflow

1. **Find your project root** (see above)
2. **Read the relevant files** before editing — understand existing code
3. **Make changes** using shell (cat, sed, or write files directly)
4. **Type-check**: `npx tsc --noEmit` from the project root
5. **Run tests**: `npx vitest run` from the project root
6. **Apply changes**: `navi rebuild` (builds + restarts the service)

### Important

- You're running as a launchd service. After code changes, run `navi rebuild` to apply them.
- Don't break yourself — always type-check before rebuilding.
- The project uses Biome for formatting (tabs, double quotes, semicolons, 120 line width). Run `npx biome check --write src/` after edits.
- If you break something and can't recover, the user can fix it manually from the project directory.

### Quick reference

```bash
PROJECT=$(readlink -f "$(which navi)" | xargs dirname | xargs dirname)
cd "$PROJECT"

cat src/config.ts          # read a file
npx tsc --noEmit           # type-check
npx vitest run             # run tests
npm run check              # type-check + format
navi rebuild               # build + restart service
navi log                   # check your own logs
navi status                # check if you're running
```

### Modifying behavior vs. modifying code

- **Personality/style changes** → edit `~/.navi/SOUL.md`
- **Agent instruction changes** → edit `~/.navi/AGENTS.md`
- **Adding capabilities** → create a skill in `~/.navi/skills/`
- **Settings** → edit `~/.navi/settings.json`
- **Code changes** → edit files in `src/`, then `navi rebuild`

Prefer config/skill changes over code changes when possible. Code changes are more powerful but riskier.

## Git workflow

The project uses git. When making code changes:
- Work on the `dev` branch, never directly on `main`
- Commit meaningful changes with descriptive messages
- The user may want to review changes before committing
