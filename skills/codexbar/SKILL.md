---
name: codexbar
description: Check AI provider usage (Claude, Codex, Cursor, Gemini, etc). Use when the user asks about API usage, credits, limits, or how much of their quota is used.
---

# CodexBar Skill

## Install

```bash
brew install codexbar
# or
brew tap some-tap/codexbar && brew install codexbar

# Verify
codexbar --version
```

## Check usage

```bash
# All providers (clean summary)
codexbar usage --provider all --format json 2>/dev/null

# Specific provider
codexbar usage --provider claude
codexbar usage --provider codex
```

## Providers
- `codex` — OpenAI Codex
- `claude` — Anthropic Claude
- `cursor` — Cursor
- `gemini` — Google Gemini
- `copilot` — GitHub Copilot

## Output fields
- `primary.usedPercent` — usage in current window
- `primary.resetDescription` — when the window resets
- `secondary.usedPercent` — weekly usage
- `secondary.resetDescription` — weekly reset date

## Notes
- Requires browser cookies (Safari/Chrome) for web-backed data
- Falls back to CLI auth when cookies unavailable
- Run `codexbar auth` to configure providers
