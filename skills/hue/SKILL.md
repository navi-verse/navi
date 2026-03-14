---
name: hue
description: Control Philips Hue lights. Use when the user asks to turn on/off lights, dim, change color or color temperature, or check light status.
---

# Philips Hue Skill

## Install

```bash
brew install openhue-cli

# Verify
openhue --version

# Configure (pair with bridge)
openhue configure
# Press the link button on your Hue bridge when prompted
```

Uses `openhue` CLI at `/opt/homebrew/bin/openhue`.

## Discovery

Run `openhue get rooms` and `openhue get lights` to discover the user's setup.

## Commands

```bash
openhue get lights                              # list all lights
openhue get rooms                               # list rooms
openhue set light "Ceiling" --on
openhue set light "Ceiling" --off
openhue set room "Living room" --on
openhue set room "Living room" --off
openhue set light "Ceiling" --brightness 50     # 0-100
openhue set room "Kitchen" --brightness 80
openhue set light "Ceiling" --color-temperature 2700   # warm (2000-6500K)
openhue set light "Ceiling" --color-temperature 6000   # cool/daylight
openhue set light "TV" --color "#FF6600"        # hex color
```

## Notes
- Room names are case-sensitive
