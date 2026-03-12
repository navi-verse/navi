---
name: create-skill
description: Create new skills or update existing skills in ~/.navi/skills/ following the agentskills.io specification. Use when the user asks to create a skill, add a new capability, make a reusable workflow, or turn the current conversation into a skill. Also use when updating or improving an existing skill.
---

# Skill Creator

Create and improve skills that extend your capabilities with specialized knowledge, workflows, and tools.

## Process

### 1. Capture intent

Understand what the skill should do before writing anything. The conversation may already contain a workflow to capture (e.g. "turn this into a skill"). If so, extract the steps, tools used, corrections made, and input/output formats.

Key questions:
1. What should this skill enable you to do?
2. When should it trigger? (what user phrases/contexts)
3. What's the expected output?
4. Are there edge cases or variations?

Ask clarifying questions if the intent is unclear. Don't overwhelm — start with the most important gaps.

### 2. Plan reusable contents

Before writing, analyze what should be bundled:

- **Scripts** (`scripts/`): Code that would be rewritten every time. E.g. `scripts/rotate_pdf.py` for PDF rotation.
- **References** (`references/`): Documentation loaded on demand. E.g. `references/schema.md` for database schemas.
- **Assets** (`assets/`): Templates, images, boilerplate used in output. E.g. `assets/template.html`.

### 3. Create the skill

#### Directory structure

```
~/.navi/skills/<skill-name>/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
└── assets/           # Optional: templates, resources
```

The directory name MUST match the `name` field in frontmatter.

#### Naming rules

- 1-64 characters
- Lowercase letters, numbers, and hyphens only (`a-z`, `0-9`, `-`)
- No leading, trailing, or consecutive hyphens
- Prefer short, descriptive names: `pdf-processing`, `code-review`, `meal-planner`

#### SKILL.md format

```markdown
---
name: <skill-name>
description: <What it does AND when to use it. Max 1024 chars. Be specific.>
---

<Markdown instructions>
```

Only `name` and `description` are required in frontmatter. Optional fields: `license`, `compatibility` (max 500 chars), `metadata` (key-value pairs), `allowed-tools` (space-delimited).

### 4. Writing principles

#### Descriptions trigger the skill

The description is the primary mechanism that determines whether the skill gets activated. Include both what the skill does AND specific contexts for when to use it. All "when to use" info goes in the description, not the body — the body only loads after triggering.

Good: "Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction."

Bad: "Helps with PDFs."

#### Be concise — context is precious

The context window is shared with everything else: system prompt, conversation history, other skills' metadata. Only include information that isn't already obvious. Challenge each paragraph: does this justify its token cost?

Prefer concise examples over verbose explanations.

#### Explain the why, not just the what

Explain reasoning behind instructions rather than heavy-handed MUSTs. The model is smart — understanding *why* something matters produces better results than rigid rules.

#### Match specificity to fragility

- **High freedom** (text guidance): Multiple valid approaches, context-dependent decisions
- **Medium freedom** (pseudocode/parameterized scripts): Preferred pattern exists, some variation OK
- **Low freedom** (exact scripts): Fragile operations, consistency critical, specific sequence required

#### Progressive disclosure

Skills use three-level loading to manage context efficiently:

1. **Metadata** (~100 tokens): `name` + `description` — always in context
2. **SKILL.md body** (<5000 tokens recommended): loaded when skill triggers
3. **Bundled resources** (unlimited): loaded on demand

Keep SKILL.md under 500 lines. Split longer content into reference files with clear pointers about when to read them.

When a skill supports multiple variants/frameworks, keep only core workflow and selection guidance in SKILL.md. Move variant-specific details to separate reference files:

```
cloud-deploy/
├── SKILL.md (workflow + provider selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

For large reference files (>100 lines), include a table of contents. Keep references one level deep from SKILL.md.

### 5. Verify

After creating the skill, confirm:
- Directory name matches `name` field
- Name follows all naming rules
- Description is specific and includes trigger contexts
- Instructions are clear and actionable
- All referenced files exist
- No unnecessary files (no README.md, CHANGELOG.md, etc.)

Skills are available immediately in new sessions. Existing sessions need a restart.

### 6. Iterate

After the user tries the skill:
1. Notice what worked and what didn't
2. Generalize from specific feedback — don't overfit to examples
3. Keep instructions lean — remove what isn't pulling its weight
4. Look for repeated work that could become a bundled script
5. Rerun and review
