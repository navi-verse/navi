// config.ts — Settings + per-contact path helpers

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";

export const dataDir = join(homedir(), ".navi");
export const brainDir = join(dataDir, "brain");

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
	streamingBehavior: "steer" | "followUp";
	routineIntervalSeconds?: number;
}

// ── Load settings ────────────────────────────────────

const settingsPath = join(dataDir, "settings.json");

const defaults: NaviSettings = {
	allowedJids: [],
	defaultModels,
	thinkingLevel: "low",
	steeringMode: "all",
	followUpMode: "all",
	streamingBehavior: "steer" as const,
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

// ── Load soul + agents ──────────────────────────────

const defaultsDir = join(dirname(import.meta.dirname), "defaults");
const soulPath = join(dataDir, "SOUL.md");
const agentsPath = join(dataDir, "AGENTS.md");

function seedDefaults(target: string, src: string) {
	if (!existsSync(src)) return;
	mkdirSync(target, { recursive: true });
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		const srcPath = join(src, entry.name);
		const destPath = join(target, entry.name);
		if (entry.isDirectory()) {
			seedDefaults(destPath, srcPath);
		} else if (!existsSync(destPath)) {
			copyFileSync(srcPath, destPath);
		}
	}
}

function loadFile(path: string): { content: string; source: string } {
	if (existsSync(path)) return { content: readFileSync(path, "utf-8").trim(), source: path };
	return { content: "", source: path };
}

// ── Config ───────────────────────────────────────────

const settings = loadSettings();
seedDefaults(dataDir, defaultsDir);
const soul = loadFile(soulPath);
const agents = loadFile(agentsPath);

export const config = {
	...settings,
	soul: soul.content,
	soulSource: soul.source,
	agents: agents.content,
	agentsSource: agents.source,
	workspaceDir: join(dataDir, "workspace"),
	baileysAuthDir: join(dataDir, "whatsapp-auth"),
};

// ── Logging ─────────────────────────────────────────

const logFile = join(dataDir, "navi.log");

const logger = pino({ level: "info" }, pino.destination({ dest: logFile, sync: true, mkdir: true }));

function ts(): string {
	const d = new Date();
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

export function extractFields(args: unknown[]): { msg: string; fields: Record<string, unknown> } {
	const last = args[args.length - 1];
	const hasFields =
		args.length > 1 && typeof last === "object" && last !== null && !(last instanceof Error) && !Array.isArray(last);
	const fields = hasFields ? (args.pop() as Record<string, unknown>) : {};
	const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
	return { msg, fields };
}

export const log = (...args: unknown[]) => {
	const { msg, fields } = extractFields(args);
	console.log(`[${ts()}]`, msg);
	logger.info(fields, msg);
};
export const logError = (...args: unknown[]) => {
	const { msg, fields } = extractFields(args);
	console.error(`[${ts()}]`, msg);
	logger.error(fields, msg);
};

// ── Per-contact paths ────────────────────────────────

export interface ChatPaths {
	root: string;
	playground: string;
	media: string;
	session: string;
	history: string;
	routines: string;
	jobs: string;
	soul: string;
}

const DOMAIN_TO_PREFIX: Record<string, string> = {
	"g.us": "g",
	"s.whatsapp.net": "s",
	lid: "l",
};

const PREFIX_TO_DOMAIN: Record<string, string> = Object.fromEntries(
	Object.entries(DOMAIN_TO_PREFIX).map(([d, p]) => [p, d]),
);

export function getChatDirName(contactId: string): string {
	const [local, domain] = contactId.split("@");
	const prefix = DOMAIN_TO_PREFIX[domain] ?? "s";
	return `${prefix}_${local}`;
}

export function contactIdFromDirName(dirName: string): string {
	const prefix = dirName.charAt(0);
	const local = dirName.slice(2);
	const domain = PREFIX_TO_DOMAIN[prefix] ?? "s.whatsapp.net";
	return `${local}@${domain}`;
}

export function getChatPaths(contactId: string): ChatPaths {
	const root = join(config.workspaceDir, getChatDirName(contactId));
	const playground = join(root, "playground");
	return {
		root,
		playground,
		media: join(playground, "media"),
		session: join(root, "session"),
		history: join(root, "HISTORY.md"),
		routines: join(root, "ROUTINES.md"),
		jobs: join(root, "jobs.json"),
		soul: join(root, "SOUL.md"),
	};
}
