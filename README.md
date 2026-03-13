# Navi

A personal assistant powered by [Pi's coding agent SDK](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

Messages you send on WhatsApp are routed to a Navi agent session that has shell access, a shared brain for long-term knowledge, and Pi's extensibility (skills, extensions, prompt templates).

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

# Start in dev mode (with file watching)
npm run dev
```

On first run you'll see a QR code in your terminal. Scan it with WhatsApp (Settings → Linked Devices → Link a Device).

## Running as a service

Install Navi as a macOS launchd service so it runs in the background and auto-starts on login:

```bash
# Build, install service, and link `navi` CLI to PATH
bin/navi install

# After install, use from anywhere:
navi status     # Check if running
navi log        # Tail the live log
navi stop       # Stop the service
navi start      # Start the service
navi restart    # Restart the service
navi rebuild    # Rebuild and restart
navi uninstall  # Stop, remove service and CLI link
```

`navi install` does three things:
1. Builds the project (`npm run build`)
2. Symlinks `navi` to `/usr/local/bin/` so it works from anywhere
3. Registers a launchd service that auto-restarts on crash and starts on login

## Configuration

Settings live in `~/.navi/settings.json` (created on first run):

```jsonc
{
  "allowedJids": ["19995551234@s.whatsapp.net"], // country code + number
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

## Architecture

```
Transport (whatsapp.ts)  →  Channel (channel.ts)  →  Agent (agent.ts)
creates ChannelContext       commands + routing        Pi SDK sessions
```

Each WhatsApp contact gets their own Navi session with separate history and context. Knowledge is shared across all conversations via the brain directory.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Security notes

- **The agent has shell access** on the host machine. Run this in a container or VM if you don't fully trust the people messaging it.
- **Use `allowedJids`** to restrict access to your own number.

## Data storage

```
~/.navi/
  settings.json         # User config
  SOUL.md               # Personality (editable)
  AGENTS.md             # Agent instructions (editable)
  brain/                # Shared knowledge (GLOBAL.md + agent-created files)
  workspace/            # Per-contact sessions, history, routines, jobs
  whatsapp-auth/        # WhatsApp session credentials (keep private!)
```

## License

MIT
