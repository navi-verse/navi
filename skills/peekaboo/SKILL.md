---
name: peekaboo
description: Automate native macOS UI — take screenshots, click buttons, type text, control apps, windows, menus, Dock, and menu bar. Use when the user wants to interact with or automate anything on the Mac screen: native apps, system UI, menu bar items, dialogs. Also use when browser-use can't reach something (native apps, system dialogs, Dock, Spaces). Can run natural-language agent tasks against the screen.
---

# Peekaboo Skill

## Install

```bash
brew install steipete/tap/peekaboo

# Verify
peekaboo --version

# Grant required permissions (Screen Recording + Accessibility)
peekaboo permissions
# Then go to System Settings → Privacy & Security and grant both
```

CLI at `/opt/homebrew/bin/peekaboo`.

## Core pattern: See → Act

Before clicking or typing, capture the UI to get stable element IDs:

```bash
# 1. Capture UI elements
peekaboo see --app "AppName" --json

# 2. Act using label or element ID from the JSON
peekaboo click --on "Button Label"
peekaboo click --on elem_42 --snapshot <snapshot_id>
```

Find elements with jq:
```bash
peekaboo see --app "Safari" --json \
  | jq '.data.ui_elements[] | select(.label | test("Sign in"; "i"))'
```

## Screenshots

```bash
peekaboo image --mode screen --path /tmp/screen.png           # full screen
peekaboo image --mode screen --retina --path /tmp/screen.png  # retina 2x
peekaboo image --mode window --app "Safari" --path /tmp/s.png # specific app
```

## See (UI map)

```bash
peekaboo see --json                          # frontmost window
peekaboo see --app "Notes" --json            # specific app
peekaboo see --annotate --path /tmp/see.png  # annotated screenshot (debug)
peekaboo see --mode screen --json            # full screen
```

## Click

```bash
peekaboo click --on "OK"                      # by label
peekaboo click --on elem_42 --snapshot <id>   # by element ID
peekaboo click --at 100,200                   # by coordinates
```

## Type

```bash
peekaboo type --text "Hello World"
peekaboo type --text "new value" --clear      # clear field first
```

## Keys & Hotkeys

```bash
peekaboo press return
peekaboo press escape
peekaboo hotkey cmd,t          # new tab
peekaboo hotkey cmd,shift,t    # reopen tab
peekaboo hotkey cmd,w          # close tab
```

## Scroll

```bash
peekaboo scroll --direction down --ticks 5
peekaboo scroll --on elem_42 --direction up --ticks 3
```

## Apps

```bash
peekaboo app launch --bundle-id com.apple.Notes
peekaboo app quit --app "Safari"
peekaboo app switch --app "Finder"
peekaboo list apps
```

## Windows

```bash
peekaboo window list
peekaboo window focus --app "Safari"
peekaboo window move --app "Safari" --x 0 --y 0
peekaboo window resize --app "Safari" --width 1200 --height 800
```

## Menus

```bash
peekaboo menu list --app "Safari"
peekaboo menu click --app "Safari" --item "File > New Tab"
peekaboo menubar list
peekaboo menubar click --name "Wi-Fi"
```

## Clipboard

```bash
peekaboo clipboard read
peekaboo clipboard write --text "some text"
```

## Agent (natural language)

```bash
peekaboo agent "Open Notes and create a TODO list with three items"
peekaboo agent "Check Slack mentions" --model claude-sonnet-4-5
peekaboo agent --resume    # continue last session
peekaboo agent             # interactive chat mode
peekaboo agent "Do X" --dry-run  # plan without executing
```

## Misc

```bash
peekaboo permissions                # check permissions
peekaboo list screens               # list screens
peekaboo sleep --duration 1000      # wait 1 second
peekaboo clean                      # clean snapshot cache
```

## Tips

- `--json` flag works on most commands for machine-readable output
- `--annotate` overlays element IDs on screenshots — good for debugging
- Snapshots cached at `~/.peekaboo/snapshots/` and reused across commands
- For complex multi-step tasks, `peekaboo agent` is the easiest path
- For web automation prefer browser-use; use peekaboo for native macOS apps
- To send a screenshot to the user: save to a temp path and use the `send_media` tool with the file path
