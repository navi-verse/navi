# Navi — your AI companion 🧚🏼

A personal AI companion for WhatsApp and Discord. Powered by Claude and OpenAI, built on [pi-mono](https://github.com/badlogic/pi-mono) packages.

## Features

- **WhatsApp + Discord** — DMs, group chats, voice notes, media, reactions, replies
- **Voice in, voice out** — transcribes voice messages (Groq Whisper), replies with voice notes (ElevenLabs TTS)
- **Multi-model** — Claude and OpenAI Codex with automatic fallback, per-chat model switching
- **Full bash access** — run commands, install tools, automate workflows
- **Web access** — search (Brave) and fetch any page (Jina Reader)
- **File tools** — read, write, edit files with surgical precision
- **Media handling** — send and receive images, GIFs, videos, audio, documents
- **Memory** — per-chat memory (MEMORY.md) that persists across sessions
- **Skills** — self-creating CLI tools for recurring tasks (Apple Notes, Reminders, etc.)
- **Events** — schedule reminders and recurring tasks (cron-based)
- **Message steering** — send corrections mid-task, no need to wait
- **Soul** — configurable personality via SOUL.md
- **Context** — 1M token window with auto-compaction

## Quick Start (WhatsApp)

```bash
npm install

# Login (pick one or both)
npm run login:claude     # Claude subscription (Anthropic OAuth)
npm run login:codex      # ChatGPT/Codex subscription (OpenAI OAuth)

# Optional API keys
nv --set-key brave <key>       # Web search (free at brave.com/search/api)
nv --set-key groq <key>        # Voice transcription (free at groq.com)
nv --set-key elevenlabs <key>  # Voice replies (elevenlabs.io)

# Run
npm run dev
```

Scan the QR code with WhatsApp on your phone. Done.

## Quick Start (Discord)

> Discord support is on the `feature/discord` branch.

```bash
git checkout feature/discord
npm install
```

1. Create a Discord bot at [discord.com/developers](https://discord.com/developers/applications)
2. Enable **Message Content Intent** (Bot settings)
3. Add bot to your server with permissions: Send Messages, Read Message History, Add Reactions, Use Slash Commands, Create Public Threads
4. Store the bot token:

```bash
nv --set-key discord <bot-token>
```

5. Run with `--discord` flag (or configure in main.ts)

Discord-specific features:
- **Live message editing** — bot updates its message as it works
- **Thread details** — thinking steps, tool calls, usage posted in threads
- **Rich embeds** — colored cards for /status and usage summaries
- **Slash commands** — /new, /status, /model, /help in the command picker
- **Backfill** — catches up on missed messages at startup
- **Channel/user awareness** — knows who's in the server and which channels exist

## CLI

```
nv run                                  Start the bot (foreground)
nv start | stop | restart               Manage launchd service
nv status                               Check if service is running
nv logs                                 Tail the log file
nv --login [provider]                   OAuth login (default: anthropic)
nv --set-key <provider> <key>           Store an API key
nv --install-skill <owner/repo/skill>   Install a skill from GitHub
nv --data-dir <path>                    Custom data directory (default: ~/nv/data)
```

## In-Chat Commands

| Command | Description |
|---------|-------------|
| `/new` | Fresh conversation (clears context, keeps memory) |
| `/status` | Uptime, context usage, model info |
| `/model` | Show/switch model (per-chat or global) |
| `/help` | List commands |
| `stop` | Cancel current task |

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with auto-restart on code changes |
| `npm start` | Run without watch mode |
| `npm run check` | Biome lint + TypeScript type check |
| `npm run login:claude` | Login with Claude subscription |
| `npm run login:codex` | Login with ChatGPT/Codex subscription |
| `npm run build` | Compile to dist/ |
| `npm run install-global` | Build and install `nv` globally |

## Data Directory

```
~/nv/data/
├── SOUL.md                          # Bot personality and behavior
├── MEMORY.md                        # Global memory (all chats)
├── SYSTEM.md                        # Environment modification log
├── settings.json                    # Global settings
├── skills/                          # Global CLI tools
├── events/                          # Scheduled events (JSON)
├── wa-auth/                         # WhatsApp session (QR code)
├── <phone>@s.whatsapp.net/          # WhatsApp DM
├── <group>@g.us/                    # WhatsApp group
├── discord:<channelId>/             # Discord channel
│   ├── MEMORY.md                    # Chat-specific memory
│   ├── model.json                   # Per-chat model override
│   ├── log.jsonl                    # Full message history
│   ├── context.jsonl                # LLM context
│   ├── attachments/                 # Media from user
│   ├── scratch/                     # Bash working directory
│   └── skills/                      # Chat-specific tools
```

## Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read files (text + images) |
| `write` | Create/overwrite files |
| `edit` | Find-and-replace edits |
| `attach` | Send files (images, GIFs, videos, audio, docs) |
| `web_search` | Search the web (Brave Search) |
| `web_fetch` | Fetch any URL as clean markdown (Jina Reader) |
| `tts` | Text-to-speech voice notes (ElevenLabs) |
| `react` | Emoji reaction on messages |
| `reply` | Quoted reply to specific messages |
| `send_location` | Location pin |
| `send_contact` | Contact card |

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

Install from GitHub: `nv --install-skill navi-verse/navi-skills/reminders`

Ask Navi to create skills: "create a skill that checks my email"

## Multi-Model

Configure in `~/.nv/model.json` or via `/model` command:

```json
{
  "primary": { "provider": "anthropic", "model": "claude-sonnet-4-6" },
  "fallback": { "provider": "openai-codex", "model": "gpt-5.4" }
}
```

If the primary model fails (auth expired, rate limited), Navi automatically retries with the fallback. Per-chat overrides stored in `data/<chatId>/model.json`.

## Architecture

Built on [pi-mono](https://github.com/badlogic/pi-mono) packages:

- `@mariozechner/pi-agent-core` — Agent loop, tool execution, event system
- `@mariozechner/pi-ai` — Model registry, streaming, OAuth
- `@mariozechner/pi-coding-agent` — Session persistence, compaction, auth storage

Modeled after [mom](https://github.com/badlogic/pi-mono/tree/main/packages/mom) (Slack bot) with WhatsApp and Discord transports.

## License

MIT
