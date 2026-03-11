// memory.ts — Two-layer memory: MEMORY.md (long-term facts) + HISTORY.md (event log)

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

const memoryPath = join(config.memoryDir, "MEMORY.md");
const historyPath = join(config.memoryDir, "HISTORY.md");

export function initMemory() {
	mkdirSync(config.memoryDir, { recursive: true });
}

export function loadMemory(): string {
	if (!existsSync(memoryPath)) return "";
	return readFileSync(memoryPath, "utf-8").trim();
}

export function appendHistory(userMessage: string, naviResponse: string) {
	const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
	const user = userMessage.length > 200 ? `${userMessage.slice(0, 200)}...` : userMessage;
	const navi = naviResponse.length > 300 ? `${naviResponse.slice(0, 300)}...` : naviResponse;
	appendFileSync(historyPath, `[${timestamp}] user: ${user} | navi: ${navi}\n`);
}

const instructions = `
You have a two-layer memory system at ~/.navi/workspace/memory/:
- MEMORY.md — Your long-term memory of curated facts (user preferences, relationships, projects, important dates). Its contents are loaded into your context at session start. Update it with your file tools when you learn important things. Keep it concise and organized.
- HISTORY.md — Timestamped log of past interactions. Search it with grep or read_file when you need to recall past events. It's auto-maintained.`;

export function getMemoryPrompt(): string {
	const memory = loadMemory();
	const context = memory ? `\n\nYour long-term memory (from ~/.navi/workspace/memory/MEMORY.md):\n\n${memory}` : "";
	return instructions + context;
}
