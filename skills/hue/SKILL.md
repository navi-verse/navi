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

## Rooms
Living room, Bedroom, Office, Kitchen, Gym, Entrance, Hallway, Staircase, Dining

## Lights
| Name | Type | Room |
|---|---|---|
| Gym Light | ceiling_round | Gym |
| Bedroom Light | ceiling_round | Bedroom |
| TV | hue_lightstrip | Living room |
| Ceiling | ceiling_round | Living room |
| Couch 1/2/3 | spot_bulb | Living room |
| Left / Right | ceiling_round | Office |
| Entrance 1/2 | spot_bulb | Entrance |
| Hallway 1-4 | spot_bulb | Hallway |
| Kitchen Light | ceiling_round | Kitchen |
| Staircase Ceiling + 1-6 | pendant/spot | Staircase |
| Dining 1-4 | up_and_down | Dining |

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
