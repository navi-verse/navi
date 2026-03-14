---
name: truenas
description: Monitor and manage TrueNAS. Use when the user asks about storage, pools, datasets, snapshots, services, or NAS health.
---

# TrueNAS Skill

## Install

```bash
# No CLI needed — uses TrueNAS REST API via curl
# Requires: curl, python3 (pre-installed on macOS/Linux)
```

## Setup

```bash
export TRUENAS_HOST="https://your-truenas-ip-or-hostname"   # e.g. https://192.168.1.x
export TRUENAS_API_KEY="your-api-key"                       # Generated in TrueNAS → Credentials → API Keys
```

## Auth helper

```bash
TNURL="$TRUENAS_HOST/api/v2.0"
API_KEY="$TRUENAS_API_KEY"
```

## Common queries

```bash
# System info
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/system/info"

# Version
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/system/version"

# Storage pools
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/pool" | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    print(p['name'], p['status'], p['healthy'])
"

# Datasets
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/pool/dataset" | python3 -c "
import json,sys
for d in json.load(sys.stdin):
    print(d['id'], d.get('used',{}).get('parsed','?'))
"

# Services status
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/service" | python3 -c "
import json,sys
for s in json.load(sys.stdin):
    print(s['service'], s['state'])
"

# Alerts
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/alert/list"

# Disk temps
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/disk/temperatures"

# Network interfaces
curl -sk -H "Authorization: Bearer $API_KEY" "$TNURL/interface"
```

## SSH fallback (midclt)

```bash
ssh user@your-truenas-host "sudo midclt call <method> '<args_json>'"
```

## Notes
- API key generated in TrueNAS → Credentials → API Keys
- Use `-sk` with curl for self-signed certs
- Tested on TrueNAS Scale
