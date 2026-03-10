// store.ts — Per-contact JSONL message logging

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

interface LogEntry {
	ts: string;
	role: "user" | "assistant" | "system";
	text: string;
}

function logPath(contactId: string): string {
	const dirName = contactId.replace(/[^a-zA-Z0-9]/g, "_");
	const dir = join(config.sessionsDir, dirName);
	mkdirSync(dir, { recursive: true });
	return join(dir, "log.jsonl");
}

export function appendLog(contactId: string, role: LogEntry["role"], text: string): void {
	const entry: LogEntry = { ts: new Date().toISOString(), role, text };
	appendFileSync(logPath(contactId), `${JSON.stringify(entry)}\n`);
}

export function readLog(contactId: string): LogEntry[] {
	const path = logPath(contactId);
	if (!existsSync(path)) return [];

	return readFileSync(path, "utf-8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => {
			try {
				return JSON.parse(line) as LogEntry;
			} catch {
				return null;
			}
		})
		.filter((entry): entry is LogEntry => entry !== null);
}
