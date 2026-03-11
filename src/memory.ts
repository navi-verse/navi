// memory.ts — Two-layer memory: MEMORY.md (long-term facts) + HISTORY.md (event log)

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function initMemory(memory: string, history: string) {
	if (!existsSync(memory))
		writeFileSync(memory, "# Memory\n\n(Curated facts: user preferences, relationships, projects, important dates.)\n");
	if (!existsSync(history)) writeFileSync(history, "# History\n\n(Timestamped summaries of past interactions.)\n");
}

function loadMemory(memory: string): string {
	if (!existsSync(memory)) return "";
	return readFileSync(memory, "utf-8").trim();
}

export function getMemoryPrompt(memory: string, history: string): string {
	const instructions = `
You have a two-layer memory system:
- ${memory} — Your long-term memory of curated facts (user preferences, relationships, projects, important dates). Its contents are loaded into your context at session start. Update it with your file tools when you learn important things. Keep it concise and organized.
- ${history} — Timestamped log of noteworthy interactions. Append a 2-5 sentence summary when something worth remembering happens. Format: [YYYY-MM-DD HH:MM] summary. Search it with grep or read_file when you need to recall past events.`;

	const content = loadMemory(memory);
	const context = content ? `\n\nYour long-term memory (from ${memory}):\n\n${content}` : "";
	return instructions + context;
}
