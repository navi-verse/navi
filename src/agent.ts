// agent.ts — Navi session management, one session per WhatsApp contact

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	AuthStorage,
	createAgentSession,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { config } from "./config.js";
import { DEFAULT_MODELS } from "./oauth.js";

// Stores active sessions keyed by WhatsApp JID
const sessions = new Map<string, Awaited<ReturnType<typeof createAgentSession>>>();

// Shared auth + model registry (created once)
let authStorage: AuthStorage;
let modelRegistry: ModelRegistry;

export function getAuthStorage(): AuthStorage {
	return authStorage;
}

export function getModelRegistry(): ModelRegistry {
	return modelRegistry;
}

export function initAgent() {
	authStorage = AuthStorage.create();
	modelRegistry = new ModelRegistry(authStorage);

	if (config.sessionMode === "persistent") {
		mkdirSync(config.sessionsDir, { recursive: true });
	}

	console.log("🤖 Navi initialized");
}

/**
 * After OAuth login, set the default model for all active sessions.
 * Also refreshes the model registry to pick up newly available models.
 */
export async function setDefaultModelForProvider(providerId: string): Promise<string> {
	modelRegistry.refresh();

	const defaults = DEFAULT_MODELS[providerId];
	if (!defaults) return "Logged in (no default model configured for this provider).";

	const model = modelRegistry.find(defaults.provider, defaults.modelId);
	if (!model) {
		// Try to find any available model from this provider
		const available = modelRegistry.getAvailable().filter((m) => m.provider === defaults.provider);
		if (available.length > 0) {
			const fallback = available[0];
			for (const [, result] of sessions) {
				await result.session.setModel(fallback);
			}
			return `Logged in. Model set to ${fallback.name} (${fallback.provider}/${fallback.id}).`;
		}
		return `Logged in, but could not find default model ${defaults.modelId}. Use /model to select one.`;
	}

	for (const [, result] of sessions) {
		await result.session.setModel(model);
	}
	return `Logged in. Model set to ${model.name} (${model.provider}/${model.id}).`;
}

/**
 * Get or create a Navi session for a WhatsApp contact.
 * Each contact gets their own isolated session with its own history.
 */
async function getSession(jid: string) {
	const existing = sessions.get(jid);
	if (existing) {
		return existing;
	}

	// Create a per-contact session directory for persistence
	const contactId = jid.replace(/[^a-zA-Z0-9]/g, "_");
	const sessionDir = join(config.sessionsDir, contactId);

	if (config.sessionMode === "persistent") {
		mkdirSync(sessionDir, { recursive: true });
	}

	const settingsManager = SettingsManager.create(config.agentCwd);
	settingsManager.applyOverrides({
		compaction: { enabled: config.compaction },
	});

	const result = await createAgentSession({
		cwd: config.agentCwd,
		authStorage,
		modelRegistry,
		settingsManager,
		sessionManager: config.sessionMode === "persistent" ? SessionManager.create(sessionDir) : SessionManager.inMemory(),
	});

	sessions.set(jid, result);
	console.log(`🆕 Created session for ${jid}`);

	return result;
}

/**
 * Send a message to the Navi agent and collect the full response.
 * Returns the complete text response.
 */
export async function chat(jid: string, userMessage: string): Promise<string> {
	const { session } = await getSession(jid);

	// Collect the streamed response
	let response = "";
	const unsubscribe = session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			response += event.assistantMessageEvent.delta;
		}
	});

	try {
		await session.prompt(userMessage);
	} finally {
		unsubscribe();
	}

	return response.trim() || "(no response)";
}

/**
 * Reset a contact's session (e.g. if they send "/reset")
 */
export async function resetSession(jid: string): Promise<void> {
	sessions.delete(jid);
	console.log(`🗑️ Reset session for ${jid}`);
}
