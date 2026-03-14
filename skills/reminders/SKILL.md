---
name: reminders
description: Create, list, complete and delete reminders in Apple Reminders. Use when the user asks to add a reminder, set a reminder, or check their reminders.
---

# Reminders Skill

## Install

```bash
brew install remindctl

# Verify
remindctl --version
# Grant Reminders access when prompted
```

Uses `remindctl` CLI at `/opt/homebrew/bin/remindctl`.

## Lists available
- Shopping (main grocery list, iCloud shared)
- Family
- Activities
- Reminders (default)
- Backlog

## Add a reminder

```bash
remindctl add "Buy milk"
remindctl add "Buy milk" --list Shopping
remindctl add "Call doctor" --list Reminders --due "2026-03-14 14:00"
```

## List reminders

```bash
remindctl list                    # all lists
remindctl list "Shopping"         # contents of a list
remindctl show                    # all incomplete reminders
```

## Complete a reminder

```bash
remindctl complete "Buy milk"
```

## Delete a reminder

```bash
remindctl delete "Buy milk"
```

## Notes
- Default list: Reminders
- Shopping list is the shared grocery list
- Use `--due` for time-sensitive reminders
