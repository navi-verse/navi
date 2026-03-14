---
name: unifi
description: Query and manage a UniFi network and Protect cameras. Use when the user asks about network devices, connected clients, WiFi, camera status, or anything related to home network infrastructure.
---

# UniFi Skill

## Install

```bash
# No CLI needed — uses UniFi REST API via curl
# Requires: curl (pre-installed on macOS/Linux)
```

## Setup

Set these in your environment or config:

```bash
export UNIFI_HOST="https://your-unifi-gateway"       # e.g. https://gateway.home or https://192.168.1.1
export UNIFI_API_KEY="your-api-key"                  # Generated in UniFi → Settings → Control Plane → API Keys
export UNIFI_SITE_ID="your-site-id"                  # Found in UniFi dashboard URL or API response
```

## Base URLs

```bash
BASE="$UNIFI_HOST/proxy/network/integration/v1"
PBASE="$UNIFI_HOST/proxy/protect/integration/v1"
KEY="$UNIFI_API_KEY"
SITE="$UNIFI_SITE_ID"
```

Always pass: `-H "X-API-KEY: $KEY" -sk`

## Network endpoints

```bash
# Devices
curl -sk -H "X-API-KEY: $KEY" "$BASE/sites/$SITE/devices"

# Connected clients
curl -sk -H "X-API-KEY: $KEY" "$BASE/sites/$SITE/clients"
```

## Protect endpoints

```bash
# Cameras
curl -sk -H "X-API-KEY: $KEY" "$PBASE/cameras"

# Specific camera
curl -sk -H "X-API-KEY: $KEY" "$PBASE/cameras/<id>"
```

## Notes
- API key is generated per user in UniFi OS → Settings → Control Plane → API Keys
- Site ID can be found in the UniFi dashboard URL or from the `/sites` API endpoint
- Use `-sk` with curl for self-signed certs on local gateways
