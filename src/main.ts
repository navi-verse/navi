#!/usr/bin/env node

import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import { statSync, unlinkSync } from "fs";
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
	login?: boolean;
	setKey?: { provider: string; key: string };
	installSkill?: string;
	service?: "start" | "stop" | "restart" | "status" | "logs" | "run";
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);
	let workingDir: string | undefined;
	let login = false;
	let setKey: { provider: string; key: string } | undefined;
	let skill: string | undefined;
	let service: ParsedArgs["service"];

	const serviceActions = ["start", "stop", "restart", "status", "logs", "run"] as const;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--login") {
			login = true;
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
	await doLogin();
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
	console.log("  --login                              OAuth login for Anthropic");
	console.log("  --set-key <provider> <key>           Store an API key");
	console.log("  --install-skill <owner/repo/skill>   Install a skill from GitHub");
	console.log("");
	console.log("Options:");
	console.log("  --data-dir <path>                    Data directory (default: ~/nv/data)");
	process.exit(0);
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
		const chatDir = join(workingDir, chatId);
		const contextFile = join(chatDir, "context.jsonl");

		let contextSize = "0";
		try {
			const stats = statSync(contextFile);
			contextSize = `${(stats.size / 1024).toFixed(1)}KB`;
		} catch {}

		const uptime = process.uptime();
		const hours = Math.floor(uptime / 3600);
		const mins = Math.floor((uptime % 3600) / 60);

		const lines = [
			`*Navi Status*`,
			`Running: ${state?.running ? "yes" : "idle"}`,
			`Uptime: ${hours}h ${mins}m`,
			`Context: ${contextSize}`,
			`Tools: 12`,
			`Model: claude-sonnet-4-6 (1M)`,
		];
		bot.sendMessage(chatId, lines.join("\n"));
	},

	handleHelp(chatId: string, bot: WhatsAppBot): void {
		const lines = [
			"*Commands*",
			"/new — fresh conversation",
			"/status — bot status",
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
