// agent.ts — Navi session management, one session per contact

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ImageAttachment } from "./channel";
import { config } from "./config";
import { appendHistory, getMemoryPrompt, initMemory } from "./memory";

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

	mkdirSync(config.agentCwd, { recursive: true });
	mkdirSync(config.sessionsDir, { recursive: true });
	initMemory();

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
 * Each contact gets their own isolated session with its own history.
 */
async function getSession(contactId: string) {
	const existing = sessions.get(contactId);
	if (existing) {
		return existing;
	}

	// Create a per-contact session directory for persistence
	const dirName = contactId.replace(/[^a-zA-Z0-9]/g, "_");
	const sessionDir = join(config.sessionsDir, dirName);

	mkdirSync(sessionDir, { recursive: true });

	const settingsManager = SettingsManager.create(config.agentCwd);
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

	const systemPrompt = config.systemPrompt + getMemoryPrompt();
	const resourceLoader = new DefaultResourceLoader({
		cwd: config.agentCwd,
		settingsManager,
		systemPrompt,
	});
	await resourceLoader.reload();

	const result = await createAgentSession({
		cwd: config.agentCwd,
		authStorage,
		modelRegistry,
		settingsManager,
		resourceLoader,
		sessionManager: SessionManager.continueRecent(config.agentCwd, sessionDir),
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

	const trimmed = response.trim() || "(no response)";
	appendHistory(userMessage, trimmed);
	return trimmed;
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
