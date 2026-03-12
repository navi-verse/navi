## Architecture

Three-layer message flow, plus brain, routines, and jobs that make Navi proactive.

---

### Message Flow

```
Transport (whatsapp.ts)  →  Channel (channel.ts)  →  Agent (agent.ts)
creates ChannelContext       commands + routing        Pi SDK sessions
```

- **Transport** — Channel-specific connection (WhatsApp via Baileys). Downloads media, creates a `ChannelContext` with `respond()`, `sendMedia()`, typing indicators. Handles the outbox for file delivery.
- **Channel** — Shared command handling (`/stop`, `/reset`, `/status`, `/help`) and routing to the agent. Channel-agnostic. Any transport that produces a `ChannelContext` plugs in.
- **Agent** — One Pi SDK session per contact. Sessions persist across restarts via `SessionManager.continueRecent()`. Images pass as `ImageContent` (base64). Other media saved to disk with path in prompt.

### Media

Receive:
- **Images/Stickers** — Downloaded, saved to `media/`, passed to agent as vision input + file path in text
- **Video/GIF/Audio/Documents** — Downloaded, saved to `media/`, file path and size described in prompt text

Send:
- **Outbox** — Agent writes files to `outbox/` via shell. Files are delivered after each response and deleted.
- **`sendMedia()`** — Programmatic sending on `ChannelContext`, auto-detects type from extension.

---

### Brain

Shared knowledge directory at `~/.navi/brain/`. No embeddings, no vector DB. Just files.

```
~/.navi/brain/
  GLOBAL.md     ← universal facts, always in system prompt
  NADINE.md     ← agent-created, read on demand
  ANDY.md       ← agent-created, read on demand
  HOME.md       ← agent-created, read on demand
  ...           ← agent organizes however it wants
```

**GLOBAL.md** — Always injected into the system prompt. Universal facts like addresses, WiFi passwords, family info, important dates.

**Everything else** — Agent-created files organized however makes sense (by person, topic, etc.). Read on demand via shell (`cat`, `grep`, `ls`). Never pre-loaded.

**Privacy** — DM conversations are private. Never reveal what someone said in a DM. But facts about a person (preferences, plans, allergies) live in the brain and can be used anywhere.

Per-chat files that remain:
- **HISTORY.md** — Timestamped summaries of noteworthy interactions. Grep-searchable, never in prompt.
- **ROUTINES.md** — Per-chat task list for periodic check-ins.
- **jobs.json** — Scheduled jobs for this chat.

---

### Routines

A periodic pulse that lets Navi act without being asked. Each chat has its own routine list.

```
~/.navi/chats/<chat>/ROUTINES.md
```

**ROUTINES.md** — A markdown file listing active tasks and watchers. The agent reads and edits this file as tasks come and go.

Example content:
```markdown
- Check if Martin sent the mockups (deadline was Wednesday)
- Monitor NAS backup job, alert if it fails
- Track BTC price, mention if it moves more than 5% in a day
```

**Execution cycle** (configurable interval, default 30 minutes):
1. **Scan** — Iterate all chat dirs under `~/.navi/chats/`, read each ROUTINES.md.
2. **Decide** — For each non-empty routine list, send it to the LLM. It decides: skip (nothing to do) or act.
3. **Execute** — If acting, the task goes through the full agent loop (shell access, tools, everything).
4. **Notify** — If execution produces output worth sharing, deliver it to the chat.

---

### Jobs

Agent-managed job scheduler. Three schedule types:

- **`at`** — One-shot at a specific time. Auto-removes after execution.
- **`every`** — Recurring at a fixed interval (e.g. every 30 minutes).
- **`cron`** — Standard cron expressions with optional timezone (e.g. `0 9 * * 1-5 Europe/Zurich`).

```
~/.navi/chats/<chat>/jobs.json
```

Jobs are persisted as JSON per chat. The agent creates, lists, and removes jobs via a `job` tool. When a job fires, its message is injected into the agent loop and the response is delivered to the chat.

Routines are for recurring/situational checks. Jobs are for time-specific triggers. Both can coexist. "Keep an eye on the deploy and tell me if something breaks" is a routine. "Remind me to call mom at 6pm" is a job.

---

### Prompt System

Two editable files define Navi's behavior:

- **`~/.navi/SOUL.md`** — Personality and identity. Who Navi is.
- **`~/.navi/AGENTS.md`** — Operational instructions. How Navi works.

Both are seeded from `defaults/` in the repo on first start. Users can edit them freely. AGENTS.md uses `{{placeholder}}` syntax for dynamic values (contactId, workspace, brainDir, etc.) that get replaced at prompt build time.

The system prompt is composed as: SOUL.md + AGENTS.md (with placeholders replaced) + GLOBAL.md content.

---

### Per-Chat Isolation

Everything is keyed by contact ID (WhatsApp JID). Each contact gets their own session, history, routines, and jobs. Brain knowledge is shared across all conversations.

| Context | JID | Session | Brain | Routines |
|---|---|---|---|---|
| Your DM | `you@s.whatsapp.net` | Private | Shared | Your tasks |
| Mom's DM | `mom@s.whatsapp.net` | Private | Shared | Mom's tasks |
| Family group | `family@g.us` | Shared | Shared | Family tasks |

**Privacy** — DM conversations are isolated. What someone says in a DM is never revealed elsewhere. But facts about people are shared via brain files, so Navi knows Nadine is vegetarian whether in her DM or the family group.

---

### Data Layout

```
~/.navi/
  settings.json              ← user config
  SOUL.md                    ← personality (seeded from defaults/)
  AGENTS.md                  ← agent instructions (seeded from defaults/)
  brain/                     ← shared knowledge
    GLOBAL.md                ← universal facts (always in prompt)
    ...                      ← agent-created files (on demand)
  whatsapp-auth/             ← Baileys session
  chats/
    s_491234567890/           ← individual DM (JID → dir name)
      workspace/              ← agent cwd
        media/                ← received media files
        outbox/               ← files queued for delivery
      session/                ← Pi SDK session files
      HISTORY.md              ← event log (grep-only)
      ROUTINES.md             ← periodic task list
      jobs.json               ← scheduled jobs for this chat
      SOUL.md                 ← per-chat personality (optional)
    g_120363012345678901/     ← group chat (same structure)
      ...
```

### Source Files

```
src/
  index.ts        ← entry point, bootstraps everything
  config.ts       ← settings, per-chat path helpers (getChatPaths, getChatDirName)
  prompts.ts      ← system prompt composition and event prompts
  channel.ts      ← ChannelContext interface, handleMessage(), commands
  agent.ts        ← per-chat session management, chat()
  brain.ts        ← shared brain initialization (GLOBAL.md) and history seeding
  jobs.ts         ← job scheduler: at/every/cron + agent tool
  routines.ts     ← periodic check-in: scans all chats for ROUTINES.md
  whatsapp.ts     ← Baileys transport, per-chat media + outbox
  web.ts          ← web search (Brave) and web fetch tools
  stt.ts          ← voice message transcription via OpenAI
  login.ts        ← interactive provider login

defaults/
  SOUL.md         ← default personality (copied to ~/.navi/ on first start)
  AGENTS.md       ← default agent instructions (copied to ~/.navi/ on first start)
```
