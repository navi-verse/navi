// memory.ts — Memory file seeding and loading

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function initMemory(memory: string, history: string) {
	if (!existsSync(memory))
		writeFileSync(
			memory,
			"# Memory\n\n(Curated facts: personal preferences, relationships, projects, important dates.)\n",
		);
	if (!existsSync(history)) writeFileSync(history, "# History\n\n(Timestamped summaries of past interactions.)\n");
}

export function loadMemory(memory: string): string {
	if (!existsSync(memory)) return "";
	return readFileSync(memory, "utf-8").trim();
}
