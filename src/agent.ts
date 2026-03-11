// agent.ts — Navi session management, one session per contact

import { existsSync, mkdirSync, readFileSync } from "node:fs";
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
import type { ImageAttachment } from "./channel";
import { config, getChatPaths } from "./config";
import { createCronTool } from "./cron";
import { getHeartbeatPrompt, initHeartbeat } from "./heartbeat";
import { getMemoryPrompt, initMemory } from "./memory";

// Stores active sessions keyed by contact ID
const sessions = new Map<string, Awaited<ReturnType<typeof createAgentSession>>>();

// Shared auth + model registry (created once)
let authStorage: AuthStorage;
let modelRegistry: ModelRegistry;

export function getAuthStorage(): AuthStorage {
	return authStorage;
}

export function initAgent() {
	authStorage = AuthStorage.create();
	modelRegistry = new ModelRegistry(authStorage);

	mkdirSync(config.chatsDir, { recursive: true });

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
		console.log(`📌 Model: ${config.model}`);
	}

	console.log("🤖 Navi initialized");
}

/**
 * Get or create a Navi session for a contact.
 * Each contact gets their own isolated session with its own workspace, memory, and heartbeat.
 */
async function getSession(contactId: string) {
	const existing = sessions.get(contactId);
	if (existing) {
		return existing;
	}

	const paths = getChatPaths(contactId);

	// Ensure all per-chat dirs exist
	mkdirSync(paths.workspace, { recursive: true });
	mkdirSync(paths.media, { recursive: true });
	mkdirSync(paths.outbox, { recursive: true });
	mkdirSync(paths.session, { recursive: true });

	initMemory(paths.memory, paths.history);
	initHeartbeat(paths.heartbeat);

	const settingsManager = SettingsManager.create(paths.workspace);
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

	const soul = existsSync(paths.soul) ? readFileSync(paths.soul, "utf-8").trim() : config.soul;
	const basePrompt = soul ? `${soul}\n\n${config.systemPrompt}` : config.systemPrompt;
	const outboxPrompt = `\n\nTo send files back: write them to the outbox directory at ${paths.outbox}/ and they'll be delivered after your response. Images, videos, audio, and documents are all supported.`;
	const systemPrompt =
		basePrompt + outboxPrompt + getMemoryPrompt(paths.memory, paths.history) + getHeartbeatPrompt(paths.heartbeat);

	const resourceLoader = new DefaultResourceLoader({
		cwd: paths.workspace,
		settingsManager,
		systemPrompt,
	});
	await resourceLoader.reload();

	const result = await createAgentSession({
		cwd: paths.workspace,
		authStorage,
		modelRegistry,
		settingsManager,
		resourceLoader,
		sessionManager: SessionManager.continueRecent(paths.workspace, paths.session),
		tools: [...codingTools, grepTool, findTool, lsTool],
		customTools: [createCronTool(contactId)],
	});

	sessions.set(contactId, result);
	console.log(`🆕 Created session for ${contactId}`);

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
	const unsubscribe = session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			response += event.assistantMessageEvent.delta;
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
 * Abort the current agent operation for a contact.
 */
export async function abortSession(contactId: string): Promise<boolean> {
	const existing = sessions.get(contactId);
	if (!existing) return false;

	await existing.session.abort();
	console.log(`⏹️ Aborted session for ${contactId}`);
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
	console.log(`🗑️ Reset session for ${contactId}`);
}
