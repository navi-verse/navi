// agent.ts — Navi session management, one session per contact

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	AuthStorage,
	codingTools,
	createAgentSession,
	DefaultResourceLoader,
	findTool,
	grepTool,
	lsTool,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { initBrain, initHistory, loadGlobal } from "./brain";
import type { ImageAttachment } from "./channel";
import { brainDir, config, dataDir, getChatPaths, log } from "./config";
import { createJobTool } from "./jobs";
import { buildSystemPrompt } from "./prompts";
import { initRoutines } from "./routines";
import { webFetchTool, webSearchTool } from "./web";

// Stores active sessions keyed by contact ID
const sessions = new Map<string, Awaited<ReturnType<typeof createAgentSession>>>();

// Shared auth + model registry (created once)
let authStorage: AuthStorage;
let modelRegistry: ModelRegistry;

export function getAuthStorage(): AuthStorage {
	return authStorage;
}

export function initAgent() {
	authStorage = AuthStorage.create(join(dataDir, "auth.json"));
	modelRegistry = new ModelRegistry(authStorage);

	mkdirSync(config.workspaceDir, { recursive: true });
	initBrain();

	// Resolve model — either explicit or auto-pick from first logged-in provider
	if (!config.model) {
		for (const [provider, model] of Object.entries(config.defaultModels)) {
			if (authStorage.has(provider)) {
				config.model = model;
				break;
			}
		}
	}
	if (config.model) {
		log(`📌 Model: ${config.model}`);
	}

	log("🤖 Navi: initialized");
}

/**
 * Get or create a Navi session for a contact.
 * Each contact gets their own isolated session with its own playground and routines.
 */
async function getSession(contactId: string) {
	const existing = sessions.get(contactId);
	if (existing) {
		return existing;
	}

	const paths = getChatPaths(contactId);

	// Ensure all per-contact dirs exist
	mkdirSync(paths.playground, { recursive: true });
	mkdirSync(paths.media, { recursive: true });
	mkdirSync(paths.outbox, { recursive: true });
	mkdirSync(paths.session, { recursive: true });

	initHistory(paths.history);
	initRoutines(paths.routines);

	const settingsManager = SettingsManager.create(paths.playground);
	const [defaultProvider, defaultModel] = config.model?.split("/") ?? [];

	settingsManager.applyOverrides({
		defaultProvider,
		defaultModel,
		defaultThinkingLevel: config.thinkingLevel,
		steeringMode: config.steeringMode,
		followUpMode: config.followUpMode,
		compaction: { enabled: true },
		retry: config.retry,
		shellPath: config.shellPath,
		enabledModels: config.enabledModels,
		packages: config.packages,
		extensions: config.extensions,
		skills: config.skills,
	});

	const hasChatSoul = existsSync(paths.soul);
	const soul = hasChatSoul ? readFileSync(paths.soul, "utf-8").trim() : config.soul;
	const soulSource = hasChatSoul ? paths.soul : config.soulSource;
	const legacyMemoryPath = join(paths.root, "MEMORY.md");
	const fullPrompt = buildSystemPrompt({
		soul,
		soulSource,
		agents: config.agents,
		agentsSource: config.agentsSource,
		contactId,
		playground: paths.playground,
		outbox: paths.outbox,
		brainDir,
		history: paths.history,
		routines: paths.routines,
		globalContent: loadGlobal(),
		legacyMemoryPath: existsSync(legacyMemoryPath) ? legacyMemoryPath : null,
	});

	const resourceLoader = new DefaultResourceLoader({
		cwd: paths.playground,
		settingsManager,
		systemPrompt: fullPrompt,
	});
	await resourceLoader.reload();

	const result = await createAgentSession({
		cwd: paths.playground,
		authStorage,
		modelRegistry,
		settingsManager,
		resourceLoader,
		sessionManager: SessionManager.continueRecent(paths.playground, paths.session),
		tools: [...codingTools, grepTool, findTool, lsTool],
		customTools: [createJobTool(contactId, paths.jobs), webSearchTool, webFetchTool],
	});

	sessions.set(contactId, result);
	const resumed = result.session.sessionManager.getEntries().length > 0;
	log(`${resumed ? "♻️" : "🆕"} ${contactId}: session ${resumed ? "resumed" : "created"}`);

	return result;
}

/**
 * Send a message to the Navi agent and collect the full response.
 * Returns the complete text response.
 */
export async function chat(contactId: string, userMessage: string, images?: ImageAttachment[]): Promise<string> {
	const { session } = await getSession(contactId);

	// Collect the streamed response
	let response = "";
	const toolTimers = new Map<string, number>();
	const unsubscribe = session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			response += event.assistantMessageEvent.delta;
		} else if (event.type === "tool_execution_start") {
			toolTimers.set(event.toolCallId, Date.now());
			const args = JSON.stringify(event.args).substring(0, 200);
			log(`🔧 ${contactId}: ${event.toolName} → ${args}`);
		} else if (event.type === "tool_execution_end") {
			const started = toolTimers.get(event.toolCallId);
			const duration = started ? `${((Date.now() - started) / 1000).toFixed(1)}s` : "";
			toolTimers.delete(event.toolCallId);
			const status = event.isError ? "❌" : "✅";
			log(`${status} ${contactId}: ${event.toolName} ← ${duration}`);
		}
	});

	try {
		await session.prompt(userMessage, images?.length ? { images } : undefined);
	} finally {
		unsubscribe();
	}

	return response.trim() || "(no response)";
}

/**
 * Get context usage for a contact's session (if active).
 */
export function getContextUsage(
	contactId: string,
): { tokens: number | null; contextWindow: number; percent: number | null } | null {
	const existing = sessions.get(contactId);
	if (!existing) return null;
	return existing.session.getContextUsage() ?? null;
}

/**
 * Abort the current agent operation for a contact.
 */
export async function abortSession(contactId: string): Promise<boolean> {
	const existing = sessions.get(contactId);
	if (!existing) return false;

	await existing.session.abort();
	log(`⏹️ ${contactId}: session aborted`);
	return true;
}

/**
 * Reset a contact's session (e.g. if they send "/reset")
 */
export async function resetSession(contactId: string): Promise<void> {
	const existing = sessions.get(contactId);
	if (existing) {
		await existing.session.abort();
	}
	sessions.delete(contactId);

	const paths = getChatPaths(contactId);
	if (existsSync(paths.session)) {
		rmSync(paths.session, { recursive: true });
	}

	log(`🗑️ ${contactId}: session reset`);
}
