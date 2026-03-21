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
	workingDir?: string;
	login?: boolean;
	setKey?: { provider: string; key: string };
	installSkill?: string;
	service?: "start" | "stop" | "restart" | "status" | "logs";
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);
	let workingDir: string | undefined;
	let login = false;
	let setKey: { provider: string; key: string } | undefined;
	let skill: string | undefined;
	let service: ParsedArgs["service"];

	const serviceActions = ["start", "stop", "restart", "status", "logs"] as const;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--login") {
			login = true;
		} else if (arg === "--set-key" && args[i + 1] && args[i + 2]) {
			setKey = { provider: args[++i], key: args[++i] };
		} else if (arg === "--install-skill" && args[i + 1]) {
			skill = args[++i];
		} else if (serviceActions.includes(arg as any)) {
			service = arg as ParsedArgs["service"];
		} else if (!arg.startsWith("-")) {
			workingDir = arg;
		}
	}

	return {
		workingDir: workingDir ? resolve(workingDir) : undefined,
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
	const dataDir = parsedArgs.workingDir || resolve("./data");
	await installSkill(parsedArgs.installSkill, dataDir);
	process.exit(0);
}

if (parsedArgs.service) {
	serviceCmd(parsedArgs.service);
	process.exit(0);
}

if (!parsedArgs.workingDir) {
	console.error("Usage: nv <working-directory>");
	console.error("       nv --login                              OAuth login for Anthropic");
	console.error("       nv --set-key <provider> <key>           Store an API key");
	console.error("       nv --install-skill <owner/repo/skill>   Install a skill from GitHub");
	console.error("");
	console.error("Service:");
	console.error("       nv start | stop | restart | status | logs");
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

		sendVoice: async (filePath: string) => {
			await bot.sendVoiceNote(event.chatId, filePath);
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
