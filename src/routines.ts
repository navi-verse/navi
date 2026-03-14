// routines.ts — Periodic check-in: reads ROUTINES.md, sends to agent if actionable

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config, contactIdFromDirName, log, logError } from "./config";
import { routineCheckPrompt } from "./prompts";

export function initRoutines(routines: string) {
	if (!existsSync(routines)) {
		writeFileSync(routines, "# Routines\n\n(Tasks to check periodically. One per line.)\n");
	}
}

const templateLine = "(Tasks to check periodically. One per line.)";

export function hasRealTasks(content: string): boolean {
	return content.split("\n").some((line) => {
		const trimmed = line.trim();
		return trimmed !== "" && trimmed !== "# Routines" && trimmed !== templateLine;
	});
}

type RoutineCallback = (contactId: string, prompt: string) => Promise<void>;

export function startRoutines(callback: RoutineCallback) {
	const intervalMs = (config.routineIntervalSeconds ?? 1800) * 1000;
	let running = false;

	setInterval(async () => {
		if (running) return;
		running = true;

		try {
			if (!existsSync(config.workspaceDir)) return;

			const entries = readdirSync(config.workspaceDir);
			for (const entry of entries) {
				const entryPath = join(config.workspaceDir, entry);
				if (!statSync(entryPath).isDirectory()) continue;

				const routinesPath = join(entryPath, "ROUTINES.md");
				if (!existsSync(routinesPath)) continue;

				const content = readFileSync(routinesPath, "utf-8");
				if (!hasRealTasks(content)) continue;

				const contactId = contactIdFromDirName(entry);
				const prompt = routineCheckPrompt(content);

				try {
					await callback(contactId, prompt);
				} catch (err) {
					logError(`🔄 ${contactId}: routine error`, { contactId, err: String(err) });
				}
			}
		} finally {
			running = false;
		}
	}, intervalMs);

	log(`🔄 Routines: every ${config.routineIntervalSeconds ?? 1800}s, scanning all contacts`);
}
