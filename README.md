# Navi

A personal WhatsApp assistant powered by [Pi's coding agent SDK](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

Messages you send on WhatsApp are routed to a Navi agent session that has shell access, persistent memory, and all of Pi's extensibility (skills, extensions, prompt templates).

## Prerequisites

- Node.js 18+
- A WhatsApp account (you'll scan a QR code to link)
- An LLM provider account

## Setup

```bash
# Clone and install
git clone <your-repo>
cd navi
npm install

# Log in to an AI provider (interactive CLI flow)
npm run login

# Start the assistant
npm run dev
```

On first run you'll see a QR code in your terminal. Scan it with WhatsApp (Settings → Linked Devices → Link a Device).

## Configuration

Edit `src/config.ts`:

- **allowedJids** — restrict who can talk to the bot (empty = everyone)
- **systemPrompt** — customize the assistant's personality
- **agentCwd** — working directory the agent's bash tool operates in
- **sessionMode** — `"persistent"` (survives restarts) or `"memory"`

## Commands

Send these in WhatsApp:

| Command            | What it does                                    |
| ------------------ | ----------------------------------------------- |
| /login             | List available OAuth providers                  |
| /login \<n\|name\> | Log in to a provider (Anthropic, Copilot, etc.) |
| /logout \<id\>     | Log out from a provider                         |
| /providers         | Show login status for all providers             |
| /model             | List available models                           |
| /reset             | Clear conversation, start fresh                 |
| /cancel            | Cancel a pending login prompt                   |
| /help              | Show available commands                         |

### Authentication

The recommended way to log in is via the CLI before starting the bot:

```bash
npm run login
```

This opens Pi's interactive login flow in your terminal with full OAuth support for all providers (Anthropic, GitHub Copilot, Google Gemini, Antigravity, OpenAI Codex).

You can also log in via WhatsApp using `/login` as a fallback.

After login, a sane default model is automatically selected (e.g. `claude-sonnet-4-6` for Anthropic, `gemini-3.1-pro-preview` for Gemini CLI, `gpt-5.4` for OpenAI Codex).

## Adding capabilities

Pi's extension and skill system works normally:

- **Skills**: Drop a `SKILL.md` into `.pi/skills/` or `~/.pi/agent/skills/`
- **Extensions**: Add TypeScript extensions to `.pi/extensions/`
- **Prompt templates**: Add `.md` files to `.pi/prompts/`

Example: add web search by installing a pi package:

```bash
npx pi install npm:pi-skills --skills brave-search
```

## Architecture

```
WhatsApp (Baileys)
  │
  │  incoming message
  ▼
index.ts ── routes by JID ──► agent.ts
  │         │                    │
  │    /login, /logout      createAgentSession()
  │         │               per-contact sessions
  │         ▼                    │
  │      oauth.ts                │
  │    (OAuth flows,             │
  │     pending input)           │
  │         │                    │
  │  response text               │
  ◄──────────────────────────────┘
  │
  ▼
WhatsApp (reply)
```

Each WhatsApp contact gets their own isolated Navi session with separate history and context.

## Security notes

- **The agent has shell access** on the host machine. Run this in a container or VM if you don't fully trust the people messaging it.
- **Use `allowedJids`** to restrict access to your own number.
- Only use the official `@whiskeysockets/baileys` package — [malicious forks exist](https://www.npmjs.com/package/baileys).

## Data storage

```
~/.pi/agent/auth.json   # OAuth credentials (shared with Pi CLI)
~/.navi/
  sessions/             # Per-contact conversation history
  whatsapp-auth/        # WhatsApp session credentials (keep private!)
```

## License

MIT
