---
name: install-skill
description: Browse and install curated skills from the Navi skill catalog. Use when the user asks to install a skill, list available skills, or says "what skills do you have?", "install X skill", "add the weather skill", etc.
---

# Skill Installer

You have a catalog of curated skills at `{{projectRoot}}/skills/`. These are ready-to-install skills that extend your capabilities.

## Listing available skills

```bash
ls "{{projectRoot}}/skills/"
```

To see what a skill does, read its SKILL.md:

```bash
cat "{{projectRoot}}/skills/<name>/SKILL.md"
```

## Installing a skill

Copy the skill directory into your active skills directory:

```bash
cp -r "{{projectRoot}}/skills/<name>" "{{dataDir}}/skills/<name>"
```

The skill will be available immediately in new sessions.

## Checking installed skills

```bash
ls "{{dataDir}}/skills/"
```

## Uninstalling a skill

```bash
rm -rf "{{dataDir}}/skills/<name>"
```

## Guidelines

- When the user asks what's available, list the catalog with a brief description of each (read the SKILL.md frontmatter)
- When installing, confirm the skill name and what it does before copying
- After installing, let the user know the skill is active for new conversations
