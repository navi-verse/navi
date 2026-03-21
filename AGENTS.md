# Development Rules

## Code Quality
- No `any` types unless absolutely necessary
- **NEVER use inline imports** - no `await import("./foo.js")`, no `import("pkg").Type` in type positions. Always use standard top-level imports.
- Always read every file you modify in full before editing.

## Commands
- After code changes: `npm run check` (biome + tsc). Fix all errors before committing.
- NEVER run: `npm run dev`, `npm run build`
- Run specific tests: `npx tsx node_modules/vitest/dist/cli.js --run test/specific.test.ts`

## Style
- Keep answers short and concise
- No emojis in commits, code, or comments
- No fluff or cheerful filler text
- Technical prose only

## Git
- NEVER use `git add -A` or `git add .`
- Always use `git add <specific-file-paths>`
- NEVER use `git commit --no-verify`
