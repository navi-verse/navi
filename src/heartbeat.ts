// heartbeat.ts — Periodic task pulse: reads HEARTBEAT.md, sends to agent if actionable

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

const heartbeatPath = join(config.workspaceDir, "HEARTBEAT.md");

export function initHeartbeat() {
	mkdirSync(config.workspaceDir, { recursive: true });
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

const instructions = `
You have a heartbeat task list at ~/.navi/workspace/HEARTBEAT.md.
This file is checked periodically and sent to you for action. You can add tasks to it
during normal conversation when the user asks you to do something later or on a schedule.
Keep entries concise with clear actionable descriptions.`;

export function getHeartbeatPrompt(): string {
	return instructions;
}

type HeartbeatCallback = (contactId: string, prompt: string) => Promise<void>;

export function startHeartbeat(callback: HeartbeatCallback) {
	const contactId = config.heartbeatContactId;
	if (!contactId) {
		console.log("💓 Heartbeat disabled (no heartbeatContactId configured)");
		return;
	}

	const intervalMs = (config.heartbeatIntervalSeconds ?? 1800) * 1000;
	let running = false;

	setInterval(async () => {
		if (running) return;

		const content = existsSync(heartbeatPath) ? readFileSync(heartbeatPath, "utf-8") : "";
		if (!hasRealTasks(content)) return;

		running = true;
		try {
			const prompt = `Heartbeat check. Review your task list below and act on anything that's due or actionable right now.
After completing tasks, update ~/.navi/workspace/HEARTBEAT.md to reflect their new status.
If nothing needs action right now, respond with exactly "[skip]" and nothing else.

Current date/time: ${new Date().toISOString()}

--- HEARTBEAT.md ---
${content}`;

			await callback(contactId, prompt);
		} catch (err) {
			console.error("Heartbeat error:", err);
		} finally {
			running = false;
		}
	}, intervalMs);

	console.log(`💓 Heartbeat started — every ${config.heartbeatIntervalSeconds ?? 1800}s for ${contactId}`);
}
