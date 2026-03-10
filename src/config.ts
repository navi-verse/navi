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
	model?: string;
	defaultModels: Record<string, string>;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
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
	agentCwd: join(dataDir, "workspace"),
	systemPrompt: `You are Navi, a helpful personal assistant on WhatsApp.
Keep responses concise — this is a chat, not a document.
Use short paragraphs, no markdown headers or bullet points.
If the user asks you to do something on the computer, you have shell access via bash.`,
	defaultModels: {
		anthropic: "anthropic/claude-sonnet-4-6",
		"github-copilot": "github-copilot/claude-sonnet-4.6",
		"google-gemini-cli": "google-gemini-cli/gemini-3.1-pro-preview",
		"google-antigravity": "google-antigravity/gemini-3.1-pro-high",
		"openai-codex": "openai-codex/gpt-5.4",
	},
	thinkingLevel: "low",
	steeringMode: "all",
	followUpMode: "all",
	compaction: true,
	retry: { enabled: true, maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 },
	extensions: [join(dataDir, "extensions")],
	skills: [join(dataDir, "skills")],
	sessionMode: "persistent",
};

function loadSettings(): NaviSettings {
	mkdirSync(dataDir, { recursive: true });

	if (!existsSync(settingsPath)) {
		const minimal = { allowedJids: [] as string[], model: "anthropic/claude-sonnet-4-6" };
		writeFileSync(settingsPath, `${JSON.stringify(minimal, null, "\t")}\n`);
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
