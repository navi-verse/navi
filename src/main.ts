#!/usr/bin/env node

import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import { unlinkSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { type AgentRunner, getOrCreateRunner, resetRunner } from "./agent.js";
import { createEventsWatcher } from "./events.js";
import * as log from "./log.js";
import {
	formatModelName,
	loadModelConfig,
	type ModelConfig,
	resolveModel,
	saveModelConfig,
	shouldFallback,
} from "./model-config.js";
import { ChatStore } from "./store.js";
import { type NvHandler, type WhatsAppBot, WhatsAppBot as WhatsAppBotClass, type WhatsAppEvent } from "./whatsapp.js";

// ============================================================================
// Login
// ============================================================================

async function doLogin(providerId = "anthropic"): Promise<void> {
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const prompt = (msg: string): Promise<string> =>
		new Promise((resolve) => rl.question(msg, (answer) => resolve(answer)));

	console.log(`Logging in to ${providerId} via OAuth...\n`);

	await authStorage.login(providerId, {
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
	console.log(`\nLogin successful! ${providerId} credentials saved to ~/.nv/auth.json`);

	// Configure model
	const defaultModels: Record<string, { provider: string; model: string }> = {
		anthropic: { provider: "anthropic", model: "claude-sonnet-4-6" },
		"openai-codex": { provider: "openai-codex", model: "gpt-5.4" },
	};

	const newModel = defaultModels[providerId];
	if (!newModel) {
		rl.close();
		return;
	}

	const config = loadModelConfig();
	const hasPrimary = authStorage.hasAuth(config.primary.provider);

	if (hasPrimary && config.primary.provider !== providerId) {
		// Already have a different provider — ask role for the new one
		const rl2 = createInterface({ input: process.stdin, output: process.stdout });
		const answer = await new Promise<string>((res) =>
			rl2.question(
				`You already have ${formatModelName(config.primary)} configured.\nSet ${formatModelName(newModel)} as (p)rimary or (f)allback? [f] `,
				(a) => res(a.trim().toLowerCase()),
			),
		);
		rl2.close();

		if (answer === "p" || answer === "primary") {
			config.fallback = config.primary;
			config.primary = newModel;
		} else {
			config.fallback = newModel;
		}
	} else {
		config.primary = newModel;
	}

	saveModelConfig(config);
	console.log(`Primary: ${formatModelName(config.primary)}`);
	if (config.fallback) {
		console.log(`Fallback: ${formatModelName(config.fallback)}`);
	}
}

// ============================================================================
// Config
// ============================================================================

function setApiKey(provider: string, key: string): void {
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	authStorage.set(provider, { type: "api_key", key });
	console.log(`Saved ${provider} API key to ~/.nv/auth.json`);
}

async function installSkill(ref: string, dataDir: string): Promise<void> {
	// Format: owner/repo/skill-name
	const parts = ref.split("/");
	if (parts.length !== 3) {
		console.error("Format: owner/repo/skill-name (e.g. navi-verse/navi-skills/reminders)");
		process.exit(1);
	}
	const [owner, repo, skillName] = parts;
	const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/skills/${skillName}`;

	console.log(`Installing skill "${skillName}" from ${owner}/${repo}...`);

	const response = await fetch(apiBase);
	if (!response.ok) {
		console.error(`Failed to fetch skill: ${response.status} ${response.statusText}`);
		process.exit(1);
	}

	const files = (await response.json()) as Array<{ name: string; download_url: string; type: string }>;

	const skillDir = join(dataDir, "skills", skillName);
	const { mkdirSync, writeFileSync } = await import("fs");
	mkdirSync(skillDir, { recursive: true });

	for (const file of files) {
		if (file.type !== "file" || !file.download_url) continue;
		const fileResponse = await fetch(file.download_url);
		if (!fileResponse.ok) {
			console.error(`Failed to download ${file.name}`);
			continue;
		}
		const content = await fileResponse.text();
		writeFileSync(join(skillDir, file.name), content);
		console.log(`  ${file.name}`);
	}

	console.log(`Skill "${skillName}" installed to ${skillDir}`);
}

const LAUNCHD_LABEL = "com.navi.nv";

function serviceCmd(action: "start" | "stop" | "restart" | "status" | "logs"): void {
	switch (action) {
		case "start":
			execSync(`launchctl start ${LAUNCHD_LABEL}`, { stdio: "inherit" });
			console.log("Started");
			break;
		case "stop":
			execSync(`launchctl stop ${LAUNCHD_LABEL}`, { stdio: "inherit" });
			console.log("Stopped");
			break;
		case "restart":
			execSync(`launchctl stop ${LAUNCHD_LABEL}`, { stdio: "ignore" });
			execSync(`launchctl start ${LAUNCHD_LABEL}`, { stdio: "inherit" });
			console.log("Restarted");
			break;
		case "status": {
			try {
				const out = execSync(`launchctl list ${LAUNCHD_LABEL} 2>&1`, { encoding: "utf-8" });
				console.log(out.trim());
			} catch {
				console.log("Not running (launchd service not loaded)");
			}
			break;
		}
		case "logs":
			execSync("tail -f ~/nv/nv.log", { stdio: "inherit" });
			break;
	}
}

interface ParsedArgs {
	workingDir: string;
	login?: string;
	setKey?: { provider: string; key: string };
	installSkill?: string;
	service?: "start" | "stop" | "restart" | "status" | "logs" | "run";
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);
	let workingDir: string | undefined;
	let login: string | undefined;
	let setKey: { provider: string; key: string } | undefined;
	let skill: string | undefined;
	let service: ParsedArgs["service"];

	const serviceActions = ["start", "stop", "restart", "status", "logs", "run"] as const;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--login") {
			login = args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : "anthropic";
		} else if (arg === "--set-key" && args[i + 1] && args[i + 2]) {
			setKey = { provider: args[++i], key: args[++i] };
		} else if (arg === "--install-skill" && args[i + 1]) {
			skill = args[++i];
		} else if (arg.startsWith("--data-dir=")) {
			workingDir = arg.slice("--data-dir=".length);
		} else if (arg === "--data-dir" && args[i + 1]) {
			workingDir = args[++i];
		} else if (serviceActions.includes(arg as any)) {
			service = arg as ParsedArgs["service"];
		}
	}

	return {
		workingDir: resolve(workingDir || join(homedir(), "nv", "data")),
		login,
		setKey,
		installSkill: skill,
		service,
	};
}

const parsedArgs = parseArgs();

if (parsedArgs.login) {
	await doLogin(parsedArgs.login);
	process.exit(0);
}

if (parsedArgs.setKey) {
	setApiKey(parsedArgs.setKey.provider, parsedArgs.setKey.key);
	process.exit(0);
}

if (parsedArgs.installSkill) {
	await installSkill(parsedArgs.installSkill, parsedArgs.workingDir);
	process.exit(0);
}

if (parsedArgs.service && parsedArgs.service !== "run") {
	serviceCmd(parsedArgs.service);
	process.exit(0);
}

if (!parsedArgs.service) {
	console.log("Usage: nv <command>");
	console.log("");
	console.log("Commands:");
	console.log("  run                                  Start the bot (foreground)");
	console.log("  start | stop | restart               Manage launchd service");
	console.log("  status                               Check if service is running");
	console.log("  logs                                 Tail the log file");
	console.log("");
	console.log("Setup:");
	console.log("  --login [provider]                   OAuth login (default: anthropic)");
	console.log("  --set-key <provider> <key>           Store an API key");
	console.log("  --install-skill <owner/repo/skill>   Install a skill from GitHub");
	console.log("");
	console.log("Options:");
	console.log("  --data-dir <path>                    Data directory (default: ~/nv/data)");
	process.exit(0);
}

const { workingDir } = { workingDir: parsedArgs.workingDir };

// ============================================================================
// Auth check
// ============================================================================

{
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	const config = loadModelConfig();
	const hasPrimary = authStorage.hasAuth(config.primary.provider);
	const hasFallback = config.fallback ? authStorage.hasAuth(config.fallback.provider) : false;

	if (!hasPrimary && !hasFallback) {
		console.error(`No credentials found for ${config.primary.provider}.`);
		console.error("");
		console.error(`  nv --login ${config.primary.provider}`);
		console.error(`  nv --set-key ${config.primary.provider} <key>`);
		process.exit(1);
	}
	if (!hasPrimary && hasFallback) {
		log.logWarning(
			`No auth for primary model (${formatModelName(config.primary)}), will use fallback (${formatModelName(config.fallback!)})`,
		);
	}
}

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

function getState(chatId: string, modelConfig?: ModelConfig): ChatState {
	let state = chatStates.get(chatId);
	if (!state) {
		const chatDir = join(workingDir, chatId);
		const config = modelConfig || loadModelConfig();
		const model = resolveModel(config.primary);
		state = {
			running: false,
			runner: getOrCreateRunner(chatId, chatDir, workingDir, model, config.primary),
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
	let typingInterval: NodeJS.Timeout | null = null;

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
				if (!typingInterval) {
					typingInterval = setInterval(() => bot.sendTyping(event.chatId), 8000);
				}
			} else {
				if (typingInterval) {
					clearInterval(typingInterval);
					typingInterval = null;
				}
				await bot.sendAvailable(event.chatId);
			}
		},

		sendFile: async (filePath: string, title?: string) => {
			await bot.sendFile(event.chatId, filePath, title);
		},

		sendVoice: async (filePath: string) => {
			await bot.sendVoiceNote(event.chatId, filePath);
		},

		react: async (emoji: string) => {
			await bot.reactToMessage(event.chatId, event.messageId, emoji);
		},

		reply: async (messageId: string, text: string) => {
			await bot.replyToMessage(event.chatId, messageId, text);
		},

		sendLocation: async (lat: number, lng: number, name?: string) => {
			await bot.sendLocation(event.chatId, lat, lng, name);
		},

		sendContact: async (name: string, phone: string) => {
			await bot.sendContact(event.chatId, name, phone);
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

	handleNew(chatId: string, bot: WhatsAppBot): void {
		const chatDir = join(workingDir, chatId);
		const contextFile = join(chatDir, "context.jsonl");
		try {
			unlinkSync(contextFile);
		} catch {}
		// Remove cached runner so a fresh one is created
		chatStates.delete(chatId);
		bot.sendMessage(chatId, "_Context cleared. Fresh start._");
		log.logInfo(`[${chatId}] Context reset via /new`);
	},

	handleStatus(chatId: string, bot: WhatsAppBot): void {
		const state = chatStates.get(chatId);

		const uptime = process.uptime();
		const hours = Math.floor(uptime / 3600);
		const mins = Math.floor((uptime % 3600) / 60);

		const tokens = state?.runner.lastContextTokens || 0;
		const maxTokens = state?.runner.contextWindow || 1000000;
		const pct = maxTokens > 0 ? ((tokens / maxTokens) * 100).toFixed(1) : "0";
		const formatT = (n: number) =>
			n < 1000 ? `${n}` : n < 1000000 ? `${Math.round(n / 1000)}k` : `${(n / 1000000).toFixed(1)}M`;

		const messages = state?.runner.lastMessageCount || 0;

		const config = loadModelConfig();
		const modelName = state?.runner.modelInfo
			? formatModelName(state.runner.modelInfo)
			: formatModelName(config.primary);
		const fallbackName = config.fallback ? formatModelName(config.fallback) : "none";

		const lines = [
			"*Navi Status* 🧚🏼",
			`⏱ Uptime: ${hours}h ${mins}m`,
			`🧠 Context: ${formatT(tokens)} / ${formatT(maxTokens)} (${pct}%)`,
			`💬 Messages: ${messages}`,
			`⚡ Status: ${state?.running ? "working" : "idle"}`,
			`🤖 Model: ${modelName}`,
			`🔄 Fallback: ${fallbackName}`,
		];
		bot.sendMessage(chatId, lines.join("\n"));
	},

	handleModel(chatId: string, bot: WhatsAppBot, args?: string): void {
		const config = loadModelConfig();

		if (!args) {
			const lines = [
				"*Current Model*",
				`🤖 Primary: ${formatModelName(config.primary)}`,
				`🔄 Fallback: ${config.fallback ? formatModelName(config.fallback) : "none"}`,
				"",
				"Use /model provider/model to switch",
				"Use /model fallback provider/model to set fallback",
				"Use /model fallback none to remove fallback",
			];
			bot.sendMessage(chatId, lines.join("\n"));
			return;
		}

		// Handle fallback setting
		if (args.startsWith("fallback ")) {
			const fallbackArg = args.substring(9).trim();
			if (fallbackArg === "none") {
				config.fallback = undefined;
				saveModelConfig(config);
				bot.sendMessage(chatId, "Fallback removed.");
			} else {
				const parts = fallbackArg.split("/");
				if (parts.length !== 2) {
					bot.sendMessage(chatId, "Format: /model fallback provider/model");
					return;
				}
				try {
					resolveModel({ provider: parts[0], model: parts[1] });
					config.fallback = { provider: parts[0], model: parts[1] };
					saveModelConfig(config);
					bot.sendMessage(chatId, `Fallback set to ${fallbackArg}`);
				} catch {
					bot.sendMessage(chatId, `Unknown model: ${fallbackArg}`);
				}
			}
			return;
		}

		// Switch primary model
		const parts = args.split("/");
		if (parts.length !== 2) {
			bot.sendMessage(chatId, "Format: /model provider/model");
			return;
		}
		try {
			resolveModel({ provider: parts[0], model: parts[1] });
			config.primary = { provider: parts[0], model: parts[1] };
			saveModelConfig(config);
			// Reset all runners so they pick up the new model
			for (const [id] of chatStates) {
				resetRunner(id);
			}
			chatStates.clear();
			bot.sendMessage(chatId, `Model switched to ${args}`);
		} catch {
			bot.sendMessage(chatId, `Unknown model: ${args}`);
		}
	},

	handleHelp(chatId: string, bot: WhatsAppBot): void {
		const lines = [
			"*Commands*",
			"/new — fresh conversation",
			"/status — bot status",
			"/model — show/switch model",
			"/help — this message",
			"stop — cancel current task",
		];
		bot.sendMessage(chatId, lines.join("\n"));
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
			const errMsg = err instanceof Error ? err.message : String(err);
			log.logWarning(`[${event.chatId}] Run error`, errMsg);

			if (shouldFallback(errMsg)) {
				const config = loadModelConfig();
				if (config.fallback) {
					log.logInfo(`[${event.chatId}] Primary failed, trying fallback: ${formatModelName(config.fallback)}`);
					try {
						resetRunner(event.chatId);
						chatStates.delete(event.chatId);
						const fallbackState = getState(event.chatId, {
							primary: config.fallback,
						});
						fallbackState.running = true;
						const fallbackCtx = createWhatsAppContext(event, bot, fallbackState, isEvent);
						await fallbackCtx.setTyping(true);
						await fallbackState.runner.run(fallbackCtx, fallbackState.store);
						await fallbackCtx.setTyping(false);
						return;
					} catch (fallbackErr) {
						const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
						log.logWarning(`[${event.chatId}] Fallback also failed`, fbMsg);
					}
				}
				await bot.sendMessage(
					event.chatId,
					`Auth expired. Run \`nv --login ${loadModelConfig().primary.provider}\` on the host.`,
				);
			}
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
