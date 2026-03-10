# Navi

A personal assistant powered by [Pi's coding agent SDK](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

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

Settings live in `~/.navi/settings.json` (created on first run):

```jsonc
{
  "allowedJids": ["19995551234@s.whatsapp.net"], // country code + number
  "systemPrompt": "You are Navi, a helpful assistant...",
  "model": "anthropic/claude-sonnet-4-6",  // provider/model, auto-picked if unset
  "thinkingLevel": "medium",             // off | minimal | low | medium | high | xhigh
  "steeringMode": "all",                 // all | one-at-a-time
  "followUpMode": "all"                  // all | one-at-a-time
}
```

## Commands

Send these in WhatsApp:

| Command | What it does                    |
| ------- | ------------------------------- |
| /stop   | Stop the current response       |
| /status | Show model & provider info      |
| /reset  | Clear conversation, start fresh |
| /help   | Show available commands         |

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
  │                              │
  │                         createAgentSession()
  │                         per-contact sessions
  │                              │
  │         response text        │
  ◄──────────────────────────────┘
  │
  ▼
WhatsApp (reply)
```

Each WhatsApp contact gets their own isolated Navi session with separate history and context.

## Security notes

- **The agent has shell access** on the host machine. Run this in a container or VM if you don't fully trust the people messaging it.
- **Use `allowedJids`** to restrict access to your own number.

## Data storage

```
~/.pi/agent/auth.json   # OAuth credentials (shared with Pi CLI)
~/.navi/
  sessions/             # Per-contact conversation history
  whatsapp-auth/        # WhatsApp session credentials (keep private!)
```

## License

MIT
