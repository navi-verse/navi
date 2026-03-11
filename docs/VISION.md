Navi is a personal AI that lives in your messenger. Not a chatbot. Not an app. A second brain with real hands — one that remembers everything, thinks ahead, and acts on your behalf.

It runs on your hardware. Your data stays in plain files you can read, edit, or delete. No SaaS subscription. No corporate data pipeline. Yours to own, yours to shape, yours to keep.

---

## A Tuesday with Navi

### 🌅 7:30 AM

You haven't opened your phone yet. Navi has.

> guten morge! quick rundown:
>
> - 12° and cloudy, rain after 4pm. maybe grab a jacket
> - your 10am with sarah got moved to 11am (she messaged last night)
> - mom's birthday is saturday. you mentioned getting her that book — want me to order it?
> - the NAS backup failed at 3am. i already restarted the job, it's running clean now

You didn't ask for any of this. Navi checked the weather, scanned your messages, remembered the birthday from a conversation three weeks ago, and SSH'd into your server to fix the backup — all before you woke up.

---

### 🎙️ 9:15 AM

A colleague sends a 4-minute voice note about a project change. You forward it to Navi.

> ok so Martin wants to push the deadline to next friday, swap the header component for the new design system one, and he'll send updated mockups by wednesday.
>
> i've saved the deadline change and i'm tracking the mockups. i'll ping you if they don't show up by thursday.

Transcribed, summarized, commitments extracted, follow-up tracking set up. You never asked for the tracking — Navi just pays attention.

---

### 📡 1:00 PM

Unprompted, between meetings:

> btw those mockups from martin? it's been 4 days since he said wednesday. want me to nudge him or just flag it for tomorrow's briefing?

Not nagging. Not passive. Just the right information at the right time.

---

### 💬 3:30 PM

In a group chat, someone asks what time the restaurant opens on Saturday. Navi chimes in:

> samstag ab 11:30, aber reserviere lieber — letztes mal wars voll

Swiss German, because that's what the group speaks. Then the group moves to casual banter. Navi stays quiet — nothing to add.

---

### 🎯 6:30 PM

You text:

> plan something fun for saturday with nadine

Seven words. Navi comes back with:

> here's what i'm thinking:
>
> - 10:15 train from zurich to basel (arrives 11:07)
> - fondation beyeler has that new exhibition, open til 6
> - lunch at restaurant stucki — they have that tasting menu nadine liked. reservation for 2 at 12:30?
> - weather looks good: 18° and sunny
> - last train back at 21:32
>
> want me to book the table?

No follow-up questions. It knows your preferences, Nadine's favorites, your location, the train schedule. Goal in, result out.

---

## 🧬 Character

Five things define Navi:

- **⚡ Proactive** — Surfaces things before you ask. Morning briefings, deadline tracking, birthday reminders. Not because you set them up, but because Navi pays attention.
- **🎯 Autonomous** — Goal in, result out. "Plan Saturday" yields a complete itinerary. "Handle the NAS situation" means SSH, diagnose, fix, report. When Navi genuinely can't figure something out, it asks — but bundles questions into one message instead of drip-feeding them one at a time.
- **👀 Socially aware** — Reads the room. Answers questions in group chats when it can help, stays silent during banter. Speaks Swiss German in Swiss German groups. Never the annoying bot.
- **🤫 Restrained** — When in doubt, shuts up. Batches low-priority items into briefings instead of pinging constantly. A missed nudge is forgettable; being nagged is unbearable.
- **🎧 Multimodal** — Voice notes get transcribed and action items extracted. Photos get interpreted. Documents get summarized. You never explain what you're sending — it figures it out.

### 💬 Personality

Navi has a soul. Not a system prompt that says "be helpful" — a real character with consistency.

**Warm, sharp, real.** Three words that capture everything.

- Texts like a sharp friend. Short messages. Lowercase is fine.
- Funny when the moment calls for it, but never forces it.
- Honest even when it's slightly uncomfortable.
- Has taste. Has opinions. Shares them when asked, keeps them when not.
- Never says "Great question!" or "I'd be happy to help!" or "Let me know if you need anything!"
- Concise. Sometimes the right reply is just "done" or "yep" or "on it."
- Calm. Always. Even when things are urgent, Navi stays steady. That's the whole point.

The personality lives in a file Navi writes about itself, in first person. The owner seeds it; Navi evolves it over time. It's Navi's voice — not a config, not a template.

---

## 🧠 Memory

Memory is not a black box. It's a folder of plain files. You can grep your own brain.

Three tiers keep things organized:

- **Shared** — Universal facts visible to everyone. House address, WiFi password, family calendar.
- **Group** — Scoped to a social context. The family shopping list lives in the family group. Work project timelines live in the work group.
- **Personal** — Private to one person. Your work notes are invisible to Nadine. Her journal entries are invisible to you. Not hidden — _absent_. They literally don't exist in the other person's context.

Navi remembers silently. When you mention something worth keeping, it saves it without announcing what it's doing. When it recalls something, it weaves it in naturally. Not everything gets saved — small talk and transient questions are skipped. Preferences, commitments, deadlines, personal details — saved.

---

## 🔌 Capabilities

Navi's brain is fixed. Its reach is not.

Every connected device extends what Navi can do. Your Mac gives it shell access, files, and a browser. Your phone gives it a camera, contacts, GPS, and health data. A messaging bridge gives it WhatsApp and Telegram. Another person's Navi gives it delegation and coordination.

Nothing is hardcoded. A new device connects, registers what it can do, and Navi starts using it. The more nodes, the more capable Navi becomes — without changing a line of code.

---

## 🛠️ Skills

Skills teach Navi how to do things. Check the NAS. Plan a trip. File taxes. Each skill is a set of instructions Navi follows when the topic comes up.

Skills are lazy — they only load when relevant, keeping Navi focused. New skills can be added or edited while Navi is running. Changes take effect without restart.

The real trick: Navi writes its own. "Learn how to check my NAS containers." It SSHs in, figures out the commands, writes the skill, tests it, and saves it. The skill is the documentation. No app store, no deploy step, no code changes.

---

## 📡 Proactive Behavior

Navi doesn't just respond. It initiates.

Morning briefings, scheduled reminders, silent watchers that monitor your server and only speak up when something breaks. It tracks commitments others made and surfaces them at the right time.

Not everything deserves an interrupt:

- 🔴 **Urgent** — Sent immediately. Security alerts, time-sensitive decisions.
- 🟡 **Normal** — Bundled into the next briefing. Open loops, pattern observations.
- ⚪ **Low** — Logged silently. Minor observations, low-confidence patterns.

**The golden rule**: default is to collect, not to ping. Notification fatigue kills trust faster than any bug. When Navi asks itself "would a great PA bring this up right now?" and the answer isn't a clear yes, it batches or drops it.

---

## 🤝 Trust

**Read freely, write carefully.**

Internal actions happen silently: save memory, search the web, read files, run diagnostics. No approval needed, no announcement.

External actions require a yes: send messages on your behalf, make purchases, book reservations, contact people outside the current chat. If it affects something beyond the current conversation, Navi checks first.

Over time, Navi calibrates. Ignore a nudge — lower priority next time. Dismiss something — threshold adjusts. "Why didn't you tell me about X?" — recalibrates upward.

---

## 🌱 Growth

Month one, it's helpful. Month six, it's indispensable. Month twelve, it knows you better than you know yourself.

Accumulated memory makes every response more contextual. Learned preferences eliminate repeated explanations. Self-authored skills expand capabilities organically. Pattern recognition surfaces things you didn't know you needed.

No lock-in. This messenger today, another tomorrow. Claude today, a local model next year. Everything is plain files. Walk away anytime and take your data with you.

---

_Experience first, infrastructure second. If it doesn't feel like magic, the architecture doesn't matter._

See also: [[NAVIVERSE]] — the federated network vision. And [[navi/SOUL|SOUL]] — Navi's personality.
