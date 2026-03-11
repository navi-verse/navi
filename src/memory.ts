// memory.ts — Two-layer memory: MEMORY.md (long-term facts) + HISTORY.md (event log)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

const memoryPath = join(config.memoryDir, "MEMORY.md");
const historyPath = join(config.memoryDir, "HISTORY.md");

export function initMemory() {
	mkdirSync(config.memoryDir, { recursive: true });
	if (!existsSync(memoryPath))
		writeFileSync(
			memoryPath,
			"# Memory\n\n(Curated facts: user preferences, relationships, projects, important dates.)\n",
		);
	if (!existsSync(historyPath))
		writeFileSync(historyPath, "# History\n\n(Timestamped summaries of past interactions.)\n");
}

export function loadMemory(): string {
	if (!existsSync(memoryPath)) return "";
	return readFileSync(memoryPath, "utf-8").trim();
}

const instructions = `
You have a two-layer memory system at ~/.navi/workspace/memory/:
- MEMORY.md — Your long-term memory of curated facts (user preferences, relationships, projects, important dates). Its contents are loaded into your context at session start. Update it with your file tools when you learn important things. Keep it concise and organized.
- HISTORY.md — Timestamped log of noteworthy interactions. Append a 2-5 sentence summary when something worth remembering happens. Format: [YYYY-MM-DD HH:MM] summary. Search it with grep or read_file when you need to recall past events.`;

export function getMemoryPrompt(): string {
	const memory = loadMemory();
	const context = memory ? `\n\nYour long-term memory (from ~/.navi/workspace/memory/MEMORY.md):\n\n${memory}` : "";
	return instructions + context;
}
