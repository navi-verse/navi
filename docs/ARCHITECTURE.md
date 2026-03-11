## Architecture

Three-layer message flow, plus memory and scheduling systems that make Navi proactive.

---

### Message Flow

```
Transport (whatsapp.ts)  →  Channel (channel.ts)  →  Agent (agent.ts)
creates ChannelContext       commands + routing        Pi SDK sessions
```

- **Transport** — Channel-specific connection (WhatsApp via Baileys). Downloads media, creates a `ChannelContext` with `respond()`, `sendMedia()`, typing indicators. Handles the outbox for file delivery.
- **Channel** — Shared command handling (`/stop`, `/reset`, `/status`, `/help`) and routing to the agent. Channel-agnostic — any transport that produces a `ChannelContext` plugs in.
- **Agent** — One Pi SDK session per contact. Sessions persist across restarts via `SessionManager.continueRecent()`. Images pass as `ImageContent` (base64); other media saved to disk with path in prompt.

### Media

Receive:
- **Images/Stickers** — Downloaded, saved to `media/`, passed to agent as vision input + file path in text
- **Video/GIF/Audio/Documents** — Downloaded, saved to `media/`, file path and size described in prompt text

Send:
- **Outbox** — Agent writes files to `outbox/` via shell. Files are delivered after each response and deleted.
- **`sendMedia()`** — Programmatic sending on `ChannelContext`, auto-detects type from extension.

---

### Memory

Two plain files per chat. No embeddings, no vector DB.

```
~/.navi/chats/<chat>/
  MEMORY.md     ← curated facts, always in system prompt
  HISTORY.md    ← timestamped event log, grep-searchable
```

**MEMORY.md** — Small, curated. User preferences, project context, relationships, ongoing commitments. Always injected into the system prompt so the agent has it every turn. The agent updates it directly via `edit`/`write`.

**HISTORY.md** — Timestamped summaries of noteworthy interactions. Never loaded into prompt — only accessed on demand when the agent greps for past events. The agent appends entries itself when something worth remembering happens. Format: `[YYYY-MM-DD HH:MM] 2-5 sentence summary`.

Both files are created per chat on first message. The agent's regular tools (`write`, `edit`, `grep`, `read`) work on these files — no special memory API, just files the agent knows about.

---

### Cron

Agent-managed job scheduler. Three schedule types:

- **`at`** — One-shot at a specific time. Auto-removes after execution.
- **`every`** — Recurring at a fixed interval (e.g. every 30 minutes).
- **`cron`** — Standard cron expressions with optional timezone (e.g. `0 9 * * 1-5 Europe/Zurich`).

```
~/.navi/jobs.json
```

Jobs are persisted as JSON. The agent creates, lists, and removes jobs via a `cron` tool. When a job fires, its message is injected into the agent loop as if the user sent it — the agent processes it, and the response is delivered to the configured channel.

Example jobs:
- "Remind me to call mom at 6pm" → `at` job
- "Check server health every hour" → `every` job
- "Morning briefing at 7:30 on weekdays" → `cron` expression

---

### Heartbeat

A periodic pulse that lets Navi act without being asked. Each chat has its own heartbeat.

```
~/.navi/chats/<chat>/HEARTBEAT.md
```

**HEARTBEAT.md** — A markdown file listing active tasks and watchers. The agent reads and edits this file as tasks come and go.

Example content:
```markdown
- Check if Martin sent the mockups (deadline was Wednesday)
- Monitor NAS backup job — alert if it fails
- Track BTC price, mention if it moves more than 5% in a day
```

**Execution cycle** (configurable interval, default 30 minutes):
1. **Scan** — Iterate all chat dirs under `~/.navi/chats/`, read each HEARTBEAT.md.
2. **Decide** — For each non-empty heartbeat, send it to the LLM. It decides: skip (nothing to do) or run (with specific tasks).
3. **Execute** — If run, the task description goes through the full agent loop (shell access, tools, everything).
4. **Notify** — If execution produces output worth sharing, deliver it to the chat's channel.

The heartbeat is for recurring/situational checks. Cron is for time-specific triggers. Both can coexist — "check server health every hour" is cron, "keep an eye on the deploy and tell me if something breaks" is heartbeat.

---

### Per-Contact Isolation

Everything is keyed by contact ID (WhatsApp JID). Each contact gets their own session, memory, heartbeat, and cron jobs — fully isolated by default. This maps naturally to WhatsApp's JID scheme: DMs are private, groups are shared.

| Context | JID | Session | Memory | Heartbeat |
|---|---|---|---|---|
| Your DM | `you@s.whatsapp.net` | Private | Private | Your tasks |
| Mom's DM | `mom@s.whatsapp.net` | Private | Private | Mom's tasks |
| Family group | `family@g.us` | Shared | Shared | Family tasks |

**Privacy by default** — DM conversations are isolated. Knowledge from one contact never leaks to another. Group chats are naturally shared because all members send to the same group JID.

**Tradeoff** — No cross-context knowledge sharing. If you tell Navi something in a DM, it won't know it in the family group. This is intentional (privacy first). Cross-context sharing is a potential future feature.

---

### Data Layout

```
~/.navi/
  settings.json              ← user config
  soul.md                    ← personality override (optional, falls back to docs/SOUL.md)
  whatsapp-auth/             ← Baileys session
  jobs.json                  ← cron jobs (global, jobs tagged with contactId)
  chats/
    s_491234567890/           ← individual DM (JID → dir name)
      workspace/              ← agent cwd
        media/                ← received media files
        outbox/               ← files queued for delivery
      session/                ← Pi SDK session files
      MEMORY.md               ← long-term facts (in prompt)
      HISTORY.md              ← event log (grep-only)
      HEARTBEAT.md            ← periodic task list
      SOUL.md                 ← per-chat personality (optional)
    g_120363012345678901/     ← group chat (same structure)
      ...
```

### Source Files

```
src/
  index.ts        ← entry point, bootstraps everything
  config.ts       ← settings, per-chat path helpers (getChatPaths, getChatDirName)
  channel.ts      ← ChannelContext interface, handleMessage(), commands
  agent.ts        ← per-chat session management, chat()
  whatsapp.ts     ← Baileys transport, per-chat media + outbox
  memory.ts       ← two-layer memory: MEMORY.md + HISTORY.md (parameterized)
  cron.ts         ← job scheduler: at/every/cron + agent tool
  heartbeat.ts    ← periodic pulse: scans all chats for HEARTBEAT.md
```
