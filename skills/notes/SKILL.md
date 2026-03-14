---
name: notes
description: Create, read, and search Apple Notes. Use when the user asks to add a note, find a note, or append to an existing note.
---

# Notes Skill

Uses `osascript` (AppleScript) to interact with Apple Notes on macOS.
A native Swift CLI is planned (tracked in Backlog).

## Discovery

```bash
osascript -e 'tell application "Notes" to get name of every folder'
```

## Create a new note

```bash
osascript -e 'tell application "Notes"
  make new note in folder "Notes" with properties {name: "Title", body: "Content here"}
end tell'
```

In a specific folder:
```bash
osascript -e 'tell application "Notes"
  make new note in folder "My Folder" with properties {name: "Title", body: "Content"}
end tell'
```

## Append to an existing note

```bash
osascript -e 'tell application "Notes"
  set n to first note in folder "My Folder" whose name is "My Note"
  set body of n to (body of n) & "\nNew line added"
end tell'
```

## Read a note

```bash
osascript -e 'tell application "Notes"
  get body of first note in folder "Notes" whose name is "My Note"
end tell'
```

## List notes in a folder

```bash
osascript -e 'tell application "Notes" to get name of every note in folder "My Folder"'
```

## Search notes

```bash
osascript -e 'tell application "Notes" to get name of every note whose name contains "recipe"'
```

## Notes
- Notes body returns HTML — strip tags if needed
- Folder names may include emoji — include emoji in the string if present
- Default account is iCloud
