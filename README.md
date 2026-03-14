# Navi

Personal AI assistant that lives in your WhatsApp. Powered by [Pi's coding agent SDK](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Quick start

```bash
git clone https://github.com/navi-verse/navi.git && cd navi
npm install
npm run login        # authenticate with an AI provider
npm start            # start — scan QR code with WhatsApp
```

On first launch, scan the QR code with **WhatsApp > Linked Devices > Link a Device**.

> **Note:** Navi must be linked to a **dedicated phone number**, not your personal one. Running Navi on the same number you message from is not yet supported.

## Configure

`~/.navi/settings.json` is created on first run. Add your WhatsApp JID to allow messages:

```jsonc
{
  "allowedJids": ["41791235599@s.whatsapp.net"],  // country code + number
  "model": "anthropic/claude-sonnet-4-6"           // provider/model
}
```

Don't know your JID? Send a message — Navi logs the sender ID to the console.

## Run as a service

Install as a macOS launchd service (auto-starts on login, auto-restarts on crash):

```bash
./bin/navi install     # build + register service + symlink CLI
```

Then from anywhere:

```bash
navi status           # check if running
navi log              # tail live output
navi restart          # restart the service
navi update           # pull latest, install deps, restart
navi uninstall        # remove service and CLI link
```

## WhatsApp commands

| Command   | Description                     |
|-----------|---------------------------------|
| `/stop`   | Abort the current response      |
| `/reset`  | Clear conversation, start fresh |
| `/status` | Show model and context info     |
| `/help`   | List available commands         |

## Skills

Navi ships with a catalog of curated skills at `skills/`. They're not active by default — ask Navi to install them ("what skills do you have?", "install the weather skill") or copy manually:

```bash
cp -r skills/weather ~/.navi/skills/weather
```

### Built-in (always active)

| Skill | Description |
|-------|-------------|
| self | Understand and modify Navi's own source code |
| create-skill | Create new skills on demand |
| install-skill | Browse and install from the skill catalog |

### Catalog

| Skill | Description |
|-------|-------------|
| bitwarden | Look up passwords and secrets from Bitwarden/Vaultwarden |
| browser-use | AI-driven browser automation for complex web tasks |
| codexbar | Check AI provider usage, credits, and quotas |
| gifgrep | Search and send animated GIFs |
| github | Manage repos, issues, PRs, and workflows via `gh` CLI |
| hue | Control Philips Hue lights |
| imagegen | Generate and edit images via OpenAI Image API |
| notes | Create, read, and search Apple Notes |
| pdf | Read, create, merge, split, fill forms, OCR — anything PDF |
| peekaboo | Automate native macOS UI (click, type, screenshots) |
| playwright | Browser automation via Playwright CLI |
| print | Print files to a network printer |
| reminders | Manage Apple Reminders |
| screenshot | Take desktop/window/region screenshots |
| speech | Text-to-speech via OpenAI Audio API |
| truenas | Monitor and manage TrueNAS storage |
| tts | Reply with voice notes |
| unifi | Query UniFi network devices and Protect cameras |
| weather | Check weather and forecasts |
| xlsx | Read, create, and edit spreadsheets |

## Security

- **The agent has shell access** on the host. Run in a container/VM if you don't fully trust the people messaging it.
- **Use `allowedJids`** to restrict who can talk to Navi.

## Data

```
~/.navi/
  settings.json         # Config
  SOUL.md               # Personality (editable)
  AGENTS.md             # Agent instructions (editable)
  brain/                # Shared knowledge (GLOBAL.md + per-topic)
  workspace/            # Per-contact sessions, history, jobs
  whatsapp-auth/        # WhatsApp credentials (keep private!)
```

## Development

```bash
npm run dev           # run with hot reload (tsx --watch)
npm run check         # type-check + format
npm run login         # add/change provider credentials
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for internals.

## Requirements

- Node.js 20+
- An AI provider account (Anthropic, GitHub Copilot, Google, etc.)
- A WhatsApp account to link

## License

MIT
