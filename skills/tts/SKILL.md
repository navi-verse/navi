---
name: tts
description: Send a voice note reply. Use when the user asks to respond as a voice note, speak something, or reply with audio.
---

# TTS Skill (Voice Note Replies)

Uses OpenAI TTS API. Generate the audio file, then send it using the `send_media` tool.

## Setup

Requires an OpenAI API key set as `OPENAI_API_KEY` environment variable, or read from your local auth config.

## Steps

```bash
# 1. Generate audio to a temp file
curl -s -X POST "https://api.openai.com/v1/audio/speech" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"tts-1\",\"voice\":\"nova\",\"input\":\"TEXT HERE\",\"response_format\":\"opus\"}" \
  --output /tmp/reply.ogg

# 2. Verify file was written
ls -lh /tmp/reply.ogg
```

Then call the `send_media` tool with `/tmp/reply.ogg` and `voiceNote: true`.

## Voice
- Default: `nova` (warm, friendly)
- Other options: `alloy`, `echo`, `fable`, `onyx`, `shimmer`
- Model: `tts-1`
- Format: `.ogg` (opus), send with `voiceNote: true`

## Notes
- Input text: escape double quotes, keep under 4096 chars
