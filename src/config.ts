// config.ts — Settings + per-chat path helpers

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultSoul } from "./prompts";

export const dataDir = join(homedir(), ".navi");

const defaultModels: Record<string, string> = {
	anthropic: "anthropic/claude-sonnet-4-6",
	"github-copilot": "github-copilot/claude-sonnet-4.6",
	"google-gemini-cli": "google-gemini-cli/gemini-3.1-pro-preview",
	"google-antigravity": "google-antigravity/gemini-3.1-pro-high",
	"openai-codex": "openai-codex/gpt-5.4",
};

// ── Types ────────────────────────────────────────────

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

// ── Load settings ────────────────────────────────────

const settingsPath = join(dataDir, "settings.json");

const defaults: NaviSettings = {
	allowedJids: [],
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

// ── Load soul ────────────────────────────────────────

const soulPath = join(dataDir, "soul.md");

function loadSoul(): string {
	if (existsSync(soulPath)) return readFileSync(soulPath, "utf-8").trim();
	return defaultSoul;
}

// ── Config ───────────────────────────────────────────

const settings = loadSettings();

export const config = {
	...settings,
	soul: loadSoul(),
	chatsDir: join(dataDir, "chats"),
	baileysAuthDir: join(dataDir, "whatsapp-auth"),
};

// ── Per-chat paths ───────────────────────────────────

export interface ChatPaths {
	root: string;
	workspace: string;
	media: string;
	outbox: string;
	session: string;
	memory: string;
	history: string;
	heartbeat: string;
	jobs: string;
	soul: string;
}

function getChatDirName(contactId: string): string {
	const [local, domain] = contactId.split("@");
	const prefix = domain === "g.us" ? "g" : "s";
	return `${prefix}_${local}`;
}

export function contactIdFromDirName(dirName: string): string {
	const prefix = dirName.charAt(0);
	const local = dirName.slice(2);
	const domain = prefix === "g" ? "g.us" : "s.whatsapp.net";
	return `${local}@${domain}`;
}

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
		jobs: join(root, "jobs.json"),
		soul: join(root, "SOUL.md"),
	};
}
