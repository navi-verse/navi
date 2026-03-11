// memory.ts — Two-layer memory: MEMORY.md (long-term facts) + HISTORY.md (event log)

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function initMemory(memoryFile: string, historyFile: string) {
	if (!existsSync(memoryFile))
		writeFileSync(
			memoryFile,
			"# Memory\n\n(Curated facts: user preferences, relationships, projects, important dates.)\n",
		);
	if (!existsSync(historyFile))
		writeFileSync(historyFile, "# History\n\n(Timestamped summaries of past interactions.)\n");
}

export function loadMemory(memoryFile: string): string {
	if (!existsSync(memoryFile)) return "";
	return readFileSync(memoryFile, "utf-8").trim();
}

export function getMemoryPrompt(memoryFile: string, historyFile: string): string {
	const instructions = `
You have a two-layer memory system:
- ${memoryFile} — Your long-term memory of curated facts (user preferences, relationships, projects, important dates). Its contents are loaded into your context at session start. Update it with your file tools when you learn important things. Keep it concise and organized.
- ${historyFile} — Timestamped log of noteworthy interactions. Append a 2-5 sentence summary when something worth remembering happens. Format: [YYYY-MM-DD HH:MM] summary. Search it with grep or read_file when you need to recall past events.`;

	const memory = loadMemory(memoryFile);
	const context = memory ? `\n\nYour long-term memory (from ${memoryFile}):\n\n${memory}` : "";
	return instructions + context;
}
