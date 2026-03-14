---
name: bitwarden
description: Look up passwords, secrets, and credentials from Bitwarden or Vaultwarden. Use when the user asks for a password, API key, login, or any stored secret.
---

# Bitwarden Skill

## Install

```bash
# macOS
brew install bitwarden-cli

# Verify
bw --version
```

## Setup

Configure the server (skip for cloud Bitwarden):

```bash
# Self-hosted Vaultwarden or Bitwarden server
bw config server https://your-vault-host

# Log in
bw login your@email.com
```

## Unlock (required before any operation)

```bash
export BW_SESSION=$(bw unlock --raw)
```

## Search / get items

```bash
# Search by name
bw list items --search "github" --session $BW_SESSION | python3 -m json.tool

# Get a specific item by ID
bw get item "ITEM_ID" --session $BW_SESSION

# Get just the password
bw get password "github" --session $BW_SESSION

# Get username
bw get username "github" --session $BW_SESSION

# Get a note
bw get notes "ssh key" --session $BW_SESSION
```

## List all items

```bash
bw list items --session $BW_SESSION | python3 -c "
import json,sys
for i in json.load(sys.stdin):
    print(i['id'], i['name'])
"
```

## Lock when done

```bash
bw lock
```

## Notes
- Always lock after use
- Never log or expose passwords in responses — retrieve and use silently
- Status check: `bw status`
