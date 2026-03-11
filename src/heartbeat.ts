// heartbeat.ts — Periodic task pulse: reads HEARTBEAT.md, sends to agent if actionable

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config, contactIdFromDirName } from "./config";
import { heartbeatCheckPrompt } from "./prompts";

export function initHeartbeat(heartbeat: string) {
	if (!existsSync(heartbeat)) {
		writeFileSync(heartbeat, "# Heartbeat\n\n(Tasks to check periodically. One per line.)\n");
	}
}

const templateLine = "(Tasks to check periodically. One per line.)";

function hasRealTasks(content: string): boolean {
	return content.split("\n").some((line) => {
		const trimmed = line.trim();
		return trimmed !== "" && trimmed !== "# Heartbeat" && trimmed !== templateLine;
	});
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
				const prompt = heartbeatCheckPrompt(heartbeatPath, content);

				try {
					await callback(contactId, prompt);
				} catch (err) {
					console.error(`💓 ${contactId}: error`, err);
				}
			}
		} finally {
			running = false;
		}
	}, intervalMs);

	console.log(`💓 Heartbeat: every ${config.heartbeatIntervalSeconds ?? 1800}s, scanning all chats`);
}
