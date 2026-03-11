// config.ts — Loads settings from ~/.navi/settings.json with defaults

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
	| {
			source: string;
			extensions?: string[];
			skills?: string[];
			prompts?: string[];
			themes?: string[];
	  };

interface NaviSettings {
	allowedJids: string[];
	systemPrompt: string;
	model?: string;
	defaultModels: Record<string, string>;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	retry: RetrySettings;
	shellPath?: string;
	enabledModels?: string[];
	packages?: PackageSource[];
	extensions: string[];
	skills: string[];
	heartbeatIntervalSeconds?: number;
}

const defaultSystemPrompt = `You are Navi, a helpful personal assistant.
Keep responses concise — this is a chat, not a document.
Use short paragraphs, no markdown headers or bullet points.
If the user asks you to do something on the computer, you have shell access via bash.

Media: Images sent to you are visible — you can see and describe them. Other media (audio, video, documents) are saved to disk and you'll see the file path. You can read/process these files via shell.`;

const defaultModels: Record<string, string> = {
	anthropic: "anthropic/claude-sonnet-4-6",
	"github-copilot": "github-copilot/claude-sonnet-4.6",
	"google-gemini-cli": "google-gemini-cli/gemini-3.1-pro-preview",
	"google-antigravity": "google-antigravity/gemini-3.1-pro-high",
	"openai-codex": "openai-codex/gpt-5.4",
};

const defaults: NaviSettings = {
	allowedJids: [],
	systemPrompt: defaultSystemPrompt,
	defaultModels,
	thinkingLevel: "low",
	steeringMode: "all",
	followUpMode: "all",
	retry: { enabled: true, maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 },
	extensions: [join(dataDir, "extensions")],
	skills: [join(dataDir, "skills")],
};

function loadSettings(): NaviSettings {
	mkdirSync(dataDir, { recursive: true });

	if (!existsSync(settingsPath)) {
		const minimal = {
			allowedJids: [] as string[],
			model: "anthropic/claude-sonnet-4-6",
		};
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
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const soulPath = join(dataDir, "soul.md");
const defaultSoulPath = join(repoRoot, "docs", "SOUL.md");

function loadSoul(): string {
	if (existsSync(soulPath)) return readFileSync(soulPath, "utf-8").trim();
	if (existsSync(defaultSoulPath)) return readFileSync(defaultSoulPath, "utf-8").trim();
	return "";
}

export const config = {
	...settings,
	soul: loadSoul(),
	chatsDir: join(dataDir, "chats"),
	baileysAuthDir: join(dataDir, "whatsapp-auth"),
};

// ── Per-chat directory helpers ───────────────────────

export interface ChatPaths {
	root: string;
	workspace: string;
	media: string;
	outbox: string;
	session: string;
	memory: string;
	history: string;
	heartbeat: string;
	soul: string;
}

/** Convert a WhatsApp JID to a filesystem-safe directory name */
export function getChatDirName(contactId: string): string {
	// 491234567890@s.whatsapp.net → s_491234567890
	// 120363012345678901@g.us     → g_120363012345678901
	const [local, domain] = contactId.split("@");
	const prefix = domain === "g.us" ? "g" : "s";
	return `${prefix}_${local}`;
}

/** Reverse of getChatDirName */
export function contactIdFromDirName(dirName: string): string {
	const prefix = dirName.charAt(0);
	const local = dirName.slice(2);
	const domain = prefix === "g" ? "g.us" : "s.whatsapp.net";
	return `${local}@${domain}`;
}

/** Get all per-chat paths for a given contact */
export function getChatPaths(contactId: string): ChatPaths {
	const root = join(config.chatsDir, getChatDirName(contactId));
	const workspace = join(root, "workspace");
	return {
		root,
		workspace,
		media: join(workspace, "media"),
		outbox: join(workspace, "outbox"),
		session: join(root, "session"),
		memory: join(root, "MEMORY.md"),
		history: join(root, "HISTORY.md"),
		heartbeat: join(root, "HEARTBEAT.md"),
		soul: join(root, "SOUL.md"),
	};
}
