// agent.ts — Navi session management, one session per WhatsApp contact

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
import { config } from "./config.js";

// Stores active sessions keyed by WhatsApp JID
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

	mkdirSync(sessionDir, { recursive: true });

	const settingsManager = SettingsManager.create(config.agentCwd);
	const [defaultProvider, defaultModel] = config.model?.split("/") ?? [];

	settingsManager.applyOverrides({
		defaultProvider,
		defaultModel,
		defaultThinkingLevel: config.thinkingLevel,
		steeringMode: config.steeringMode,
		followUpMode: config.followUpMode,
		compaction: { enabled: config.compaction },
		retry: config.retry,
		shellPath: config.shellPath,
		enabledModels: config.enabledModels,
		packages: config.packages,
		extensions: config.extensions,
		skills: config.skills,
	});

	const resourceLoader = new DefaultResourceLoader({
		cwd: config.agentCwd,
		settingsManager,
		systemPrompt: config.systemPrompt,
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
