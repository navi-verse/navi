---
name: gifgrep
description: Search and send animated GIFs. Use when the user asks for a GIF or a reaction animation.
---

# GIF Skill

## Install

```bash
# gifgrep
brew install gifgrep

# ffmpeg (for conversion)
brew install ffmpeg

# Verify
gifgrep --version
ffmpeg -version
```

## Sending as animated video (default for WhatsApp)

WhatsApp renders .gif as a static image. Convert to mp4 so it plays as animation.

```bash
# 1. Search
gifgrep search <query> --max 1 --format url 2>/dev/null

# 2. Download to temp
curl -fsSL "<url>" -o /tmp/gif_temp.gif

# 3. Convert to mp4
ffmpeg -i /tmp/gif_temp.gif \
  -movflags faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -c:v libx264 \
  /tmp/gif.mp4 -y 2>/dev/null

# 4. Clean up temp
rm /tmp/gif_temp.gif
```

Then call the `send_media` tool with `/tmp/gif.mp4` and `gif: true` to send it as a looping animation.

## Sending as GIF file

If the user explicitly asks for a .gif file:

```bash
# 1. Search
gifgrep search <query> --max 1 --format url 2>/dev/null

# 2. Download to temp
curl -fsSL "<url>" -o /tmp/gif.gif
```

Then call the `send_media` tool with `/tmp/gif.gif`.

## Notes
- Default: always send as mp4 unless the user asks for a .gif file
- Keep queries short: "surprised cat", "facepalm", "celebration"
