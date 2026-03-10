// config.ts — Loads settings from ~/.navi/settings.json with defaults

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const dataDir = join(homedir(), ".navi");
const settingsPath = join(dataDir, "settings.json");

interface RetrySettings {
	enabled: boolean;
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
}

type PackageSource =
	| string
	| { source: string; extensions?: string[]; skills?: string[]; prompts?: string[]; themes?: string[] };

interface NaviSettings {
	allowedJids: string[];
	agentCwd: string;
	systemPrompt: string;
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	compaction: boolean;
	retry: RetrySettings;
	shellPath?: string;
	enabledModels?: string[];
	packages?: PackageSource[];
	extensions: string[];
	skills: string[];
	sessionMode: "persistent" | "memory";
}

const defaults: NaviSettings = {
	allowedJids: [],
	agentCwd: process.env.AGENT_CWD || process.cwd(),
	systemPrompt: `You are Navi, a helpful personal assistant on WhatsApp.
Keep responses concise — this is a chat, not a document.
Use short paragraphs, no markdown headers or bullet points.
If the user asks you to do something on the computer, you have shell access via bash.`,
	steeringMode: "one-at-a-time",
	followUpMode: "one-at-a-time",
	compaction: true,
	retry: { enabled: true, maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 },
	extensions: [join(dataDir, "extensions")],
	skills: [join(dataDir, "skills")],
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
