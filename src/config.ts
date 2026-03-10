// config.ts — Loads settings from ~/.navi/settings.json with defaults

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const dataDir = join(homedir(), ".navi");
const settingsPath = join(dataDir, "settings.json");

interface NaviSettings {
	allowedJids: string[];
	agentCwd: string;
	systemPrompt: string;
	compaction: boolean;
	sessionMode: "persistent" | "memory";
}

const defaults: NaviSettings = {
	allowedJids: [],
	agentCwd: process.env.AGENT_CWD || process.cwd(),
	systemPrompt: `You are Navi, a helpful personal assistant on WhatsApp.
Keep responses concise — this is a chat, not a document.
Use short paragraphs, no markdown headers or bullet points.
If the user asks you to do something on the computer, you have shell access via bash.`,
	compaction: true,
	sessionMode: "persistent",
};

function loadSettings(): NaviSettings {
	mkdirSync(dataDir, { recursive: true });

	if (!existsSync(settingsPath)) {
		writeFileSync(settingsPath, `${JSON.stringify(defaults, null, "\t")}\n`);
		return defaults;
	}

	try {
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		return { ...defaults, ...raw };
	} catch (err) {
		console.error(`Failed to parse ${settingsPath}, using defaults:`, err);
		return defaults;
	}
}

const settings = loadSettings();

export const config = {
	...settings,
	sessionsDir: join(dataDir, "sessions"),
	baileysAuthDir: join(dataDir, "whatsapp-auth"),
};
