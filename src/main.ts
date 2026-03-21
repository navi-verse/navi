#!/usr/bin/env node

import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import { homedir } from "os";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { type AgentRunner, getOrCreateRunner } from "./agent.js";
import { createEventsWatcher } from "./events.js";
import * as log from "./log.js";
import { ChatStore } from "./store.js";
import { type NvHandler, type WhatsAppBot, WhatsAppBot as WhatsAppBotClass, type WhatsAppEvent } from "./whatsapp.js";

// ============================================================================
// Login
// ============================================================================

async function doLogin(): Promise<void> {
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const prompt = (msg: string): Promise<string> =>
		new Promise((resolve) => rl.question(msg, (answer) => resolve(answer)));

	console.log("Logging in to Anthropic via OAuth...\n");

	await authStorage.login("anthropic", {
		onAuth: (info) => {
			console.log(`Open this URL in your browser:\n\n  ${info.url}\n`);
			if (info.instructions) {
				console.log(info.instructions);
			}
			// Try to open browser automatically
			try {
				const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
				execSync(`${cmd} "${info.url}"`, { stdio: "ignore" });
			} catch {
				// User will open manually
			}
		},
		onPrompt: async (p) => {
			const answer = await prompt(`${p.message} `);
			return answer;
		},
		onProgress: (message) => {
			console.log(message);
		},
	});

	rl.close();
	console.log("\nLogin successful! Credentials saved to ~/.nv/auth.json");
}

// ============================================================================
// Config
// ============================================================================

function setApiKey(provider: string, key: string): void {
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	authStorage.set(provider, { type: "api_key", key });
	console.log(`Saved ${provider} API key to ~/.nv/auth.json`);
}

interface ParsedArgs {
	workingDir?: string;
	login?: boolean;
	setKey?: { provider: string; key: string };
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);
	let workingDir: string | undefined;
	let login = false;
	let setKey: { provider: string; key: string } | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--login") {
			login = true;
		} else if (arg === "--set-key" && args[i + 1] && args[i + 2]) {
			setKey = { provider: args[++i], key: args[++i] };
		} else if (!arg.startsWith("-")) {
			workingDir = arg;
		}
	}

	return {
		workingDir: workingDir ? resolve(workingDir) : undefined,
		login,
		setKey,
	};
}

const parsedArgs = parseArgs();

if (parsedArgs.login) {
	await doLogin();
	process.exit(0);
}

if (parsedArgs.setKey) {
	setApiKey(parsedArgs.setKey.provider, parsedArgs.setKey.key);
	process.exit(0);
}

if (!parsedArgs.workingDir) {
	console.error("Usage: nv <working-directory>");
	console.error("       nv --login                          OAuth login for Anthropic");
	console.error("       nv --set-key <provider> <key>       Store an API key (e.g. brave)");
	process.exit(1);
}

const { workingDir } = { workingDir: parsedArgs.workingDir };

// ============================================================================
// State (per chat)
// ============================================================================

interface ChatState {
	running: boolean;
	runner: AgentRunner;
	store: ChatStore;
	stopRequested: boolean;
}

const chatStates = new Map<string, ChatState>();

function getState(chatId: string): ChatState {
	let state = chatStates.get(chatId);
	if (!state) {
		const chatDir = join(workingDir, chatId);
		state = {
			running: false,
			runner: getOrCreateRunner(chatId, chatDir, workingDir),
			store: new ChatStore({ workingDir }),
			stopRequested: false,
		};
		chatStates.set(chatId, state);
	}
	return state;
}

// ============================================================================
// Create WhatsApp context adapter
// ============================================================================

function createWhatsAppContext(event: WhatsAppEvent, bot: WhatsAppBot, state: ChatState, _isEvent?: boolean) {
	let accumulatedText = "";
	let messageLogged = false;

	return {
		message: {
			text: event.text,
			user: event.user,
			chatId: event.chatId,
			ts: event.ts,
			attachments: event.attachments || [],
		},
		store: state.store,

		respond: async (text: string, shouldLog = true) => {
			try {
				accumulatedText = accumulatedText ? `${accumulatedText}\n${text}` : text;

				const msgId = await bot.sendMessage(event.chatId, text);

				if (shouldLog && !messageLogged) {
					bot.logBotResponse(event.chatId, accumulatedText, msgId);
					messageLogged = true;
				}
			} catch (err) {
				log.logWarning("WhatsApp respond error", err instanceof Error ? err.message : String(err));
			}
		},

		setTyping: async (isTyping: boolean) => {
			if (isTyping) {
				await bot.sendTyping(event.chatId);
			} else {
				await bot.sendAvailable(event.chatId);
			}
		},

		sendFile: async (filePath: string, title?: string) => {
			await bot.sendFile(event.chatId, filePath, title);
		},
	};
}

// ============================================================================
// Handler
// ============================================================================

const handler: NvHandler = {
	isRunning(chatId: string): boolean {
		const state = chatStates.get(chatId);
		return state?.running ?? false;
	},

	handleSteer(chatId: string, text: string): void {
		const state = chatStates.get(chatId);
		if (state?.running) {
			state.runner.steer(text);
		}
	},

	async handleStop(chatId: string, bot: WhatsAppBot): Promise<void> {
		const state = chatStates.get(chatId);
		if (state?.running) {
			state.stopRequested = true;
			state.runner.abort();
			await bot.sendMessage(chatId, "_Stopping..._");
		} else {
			await bot.sendMessage(chatId, "_Nothing running_");
		}
	},

	async handleEvent(event: WhatsAppEvent, bot: WhatsAppBot, isEvent?: boolean): Promise<void> {
		const state = getState(event.chatId);

		state.running = true;
		state.stopRequested = false;

		log.logInfo(`[${event.chatId}] Starting run: ${event.text.substring(0, 50)}`);

		try {
			const ctx = createWhatsAppContext(event, bot, state, isEvent);

			await ctx.setTyping(true);
			const result = await state.runner.run(ctx, state.store);
			await ctx.setTyping(false);

			if (result.stopReason === "aborted" && state.stopRequested) {
				await bot.sendMessage(event.chatId, "_Stopped_");
			}
		} catch (err) {
			log.logWarning(`[${event.chatId}] Run error`, err instanceof Error ? err.message : String(err));
		} finally {
			state.running = false;
		}
	},
};

// ============================================================================
// Start
// ============================================================================

log.logStartup(workingDir);

const sharedStore = new ChatStore({ workingDir });

const bot = new WhatsAppBotClass(handler, {
	workingDir,
	store: sharedStore,
});

const eventsWatcher = createEventsWatcher(workingDir, bot);
eventsWatcher.start();

process.on("SIGINT", () => {
	log.logInfo("Shutting down...");
	eventsWatcher.stop();
	process.exit(0);
});

process.on("SIGTERM", () => {
	log.logInfo("Shutting down...");
	eventsWatcher.stop();
	process.exit(0);
});

bot.start();
