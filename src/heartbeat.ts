// heartbeat.ts — Periodic task pulse: reads HEARTBEAT.md, sends to agent if actionable

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config, contactIdFromDirName } from "./config";

export function initHeartbeat(heartbeatPath: string) {
	mkdirSync(join(heartbeatPath, ".."), { recursive: true });
	if (!existsSync(heartbeatPath)) {
		writeFileSync(heartbeatPath, "# Heartbeat\n\n(Add tasks here for Navi to check periodically. One per line.)\n");
	}
}

const templateLine = "(Add tasks here for Navi to check periodically. One per line.)";

function hasRealTasks(content: string): boolean {
	return content.split("\n").some((line) => {
		const trimmed = line.trim();
		return trimmed !== "" && trimmed !== "# Heartbeat" && trimmed !== templateLine;
	});
}

export function getHeartbeatPrompt(heartbeatPath: string): string {
	return `
You have a heartbeat task list at ${heartbeatPath}.
This file is checked periodically and sent to you for action. You can add tasks to it
during normal conversation when the user asks you to do something later or on a schedule.
Keep entries concise with clear actionable descriptions.`;
}

type HeartbeatCallback = (contactId: string, prompt: string) => Promise<void>;

export function startHeartbeat(callback: HeartbeatCallback) {
	const intervalMs = (config.heartbeatIntervalSeconds ?? 1800) * 1000;
	let running = false;

	setInterval(async () => {
		if (running) return;
		running = true;

		try {
			if (!existsSync(config.chatsDir)) return;

			const entries = readdirSync(config.chatsDir);
			for (const entry of entries) {
				const entryPath = join(config.chatsDir, entry);
				if (!statSync(entryPath).isDirectory()) continue;

				const heartbeatPath = join(entryPath, "HEARTBEAT.md");
				if (!existsSync(heartbeatPath)) continue;

				const content = readFileSync(heartbeatPath, "utf-8");
				if (!hasRealTasks(content)) continue;

				const contactId = contactIdFromDirName(entry);
				const prompt = `Heartbeat check. Review your task list below and act on anything that's due or actionable right now.
After completing tasks, update ${heartbeatPath} to reflect their new status.
If nothing needs action right now, respond with exactly "[skip]" and nothing else.

Current date/time: ${new Date().toISOString()}

--- HEARTBEAT.md ---
${content}`;

				try {
					await callback(contactId, prompt);
				} catch (err) {
					console.error(`Heartbeat error for ${entry}:`, err);
				}
			}
		} finally {
			running = false;
		}
	}, intervalMs);

	console.log(`💓 Heartbeat started — every ${config.heartbeatIntervalSeconds ?? 1800}s, scanning all chats`);
}
