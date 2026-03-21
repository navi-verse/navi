# Navi — your companion in WhatsApp 🧚🏼

A personal AI companion living inside WhatsApp. Powered by Claude, built on [pi-mono](https://github.com/badlogic/pi-mono) packages, connected via [Baileys](https://github.com/WhiskeySockets/Baileys).

## Features

- **WhatsApp native** — DMs and group chats, voice notes, media, blue ticks
- **Voice in, voice out** — transcribes voice messages (Groq Whisper), replies with voice notes (ElevenLabs TTS)
- **Full bash access** — run commands, install tools, automate workflows
- **Web access** — search (Brave) and fetch any page (Jina Reader)
- **File tools** — read, write, edit files with surgical precision
- **Media handling** — send and receive images, GIFs, videos, audio, documents
- **Memory** — per-chat memory (MEMORY.md) that persists across sessions
- **Skills** — self-creating CLI tools for recurring tasks (Apple Notes, Reminders, etc.)
- **Events** — schedule reminders and recurring tasks (cron-based)
- **Message steering** — send corrections mid-task, no need to wait
- **Soul** — configurable personality via SOUL.md
- **Context** — 1M token window (Claude Sonnet 4.6) with auto-compaction

## Quick Start

```bash
# Install dependencies
npm install

# Login to Anthropic (OAuth, uses your Claude subscription)
npx tsx src/main.ts --login

# Store API keys
npx tsx src/main.ts --set-key brave <key>       # Web search (free at brave.com/search/api)
npx tsx src/main.ts --set-key groq <key>        # Voice transcription (free at groq.com)
npx tsx src/main.ts --set-key elevenlabs <key>  # Voice replies (elevenlabs.io)

# Run the bot
npm run dev
```

Scan the QR code with WhatsApp on your phone. Done.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run with auto-restart on code changes |
| `npm start` | Run without watch mode |
| `npm run check` | Biome lint + TypeScript type check |
| `npm run build` | Compile to dist/ |
| `npm run install-global` | Build and install `nv` globally |

## Data Directory

```
./data/
├── SOUL.md                          # Bot personality and behavior
├── MEMORY.md                        # Global memory (all chats)
├── SYSTEM.md                        # Environment modification log
├── settings.json                    # Global settings
├── skills/                          # Global CLI tools
├── events/                          # Scheduled events (JSON)
├── wa-auth/                         # WhatsApp session (QR code)
├── <phone>@s.whatsapp.net/          # Per-DM directory
│   ├── MEMORY.md                    # Chat-specific memory
│   ├── log.jsonl                    # Full message history
│   ├── context.jsonl                # LLM context
│   ├── attachments/                 # Media from user
│   ├── scratch/                     # Bash working directory
│   └── skills/                      # Chat-specific tools
└── <group>@g.us/                    # Per-group directory
    └── ...                          # Same structure
```

## Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read files (text + images) |
| `write` | Create/overwrite files |
| `edit` | Find-and-replace edits |
| `attach` | Send files via WhatsApp (images, GIFs, videos, audio, docs) |
| `web_search` | Search the web (Brave Search) |
| `web_fetch` | Fetch any URL as clean markdown (Jina Reader) |
| `tts` | Text-to-speech voice notes (ElevenLabs) |

## Events

Schedule reminders and recurring tasks via JSON files in `data/events/`:

```json
{"type": "one-shot", "chatId": "123@s.whatsapp.net", "text": "Dentist", "at": "2026-03-25T11:00:00+01:00"}
{"type": "periodic", "chatId": "123@s.whatsapp.net", "text": "Check inbox", "schedule": "0 9 * * 1-5", "timezone": "Europe/Zurich"}
```

Or just ask: "remind me about dentist tomorrow at 11am"

## Skills

Navi creates and manages her own CLI tools. Each skill is a directory with a `SKILL.md` and scripts:

```
data/skills/notes/
├── SKILL.md          # Name, description, usage docs
└── (scripts)         # Whatever Navi needs
```

Ask Navi to create skills: "create a skill that checks my email"

## Architecture

Built on [pi-mono](https://github.com/badlogic/pi-mono) packages:

- `@mariozechner/pi-agent-core` — Agent loop, tool execution, event system
- `@mariozechner/pi-ai` — Model registry, streaming, OAuth
- `@mariozechner/pi-coding-agent` — Session persistence, compaction, auth storage

Modeled after [mom](https://github.com/badlogic/pi-mono/tree/main/packages/mom) (Slack bot) with WhatsApp transport.

## License

MIT
