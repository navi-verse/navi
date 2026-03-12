// brain.ts — Shared brain initialization and loading

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brainDir } from "./config";

const globalPath = join(brainDir, "GLOBAL.md");

export function initBrain() {
	mkdirSync(brainDir, { recursive: true });
	if (!existsSync(globalPath))
		writeFileSync(
			globalPath,
			"# Global\n\n(Universal facts: addresses, WiFi passwords, family info, important dates.)\n",
		);
}

export function loadGlobal(): string {
	if (!existsSync(globalPath)) return "";
	return readFileSync(globalPath, "utf-8").trim();
}

export function initHistory(path: string) {
	if (!existsSync(path)) writeFileSync(path, "# History\n\n(Timestamped summaries of past interactions.)\n");
}
