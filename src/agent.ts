import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";
import type { ImageContent, Model } from "@mariozechner/pi-ai";
import {
	AgentSession,
	AuthStorage,
	convertToLlm,
	createExtensionRuntime,
	formatSkillsForPrompt,
	loadSkillsFromDir,
	ModelRegistry,
	type ResourceLoader,
	SessionManager,
	type Skill,
} from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { createNvSettingsManager, syncLogToSessionManager } from "./context.js";
import * as log from "./log.js";
import type { ModelEntry } from "./model-config.js";
import type { ChatStore } from "./store.js";
import {
	createNvTools,
	setReactFunction,
	setReplyFunction,
	setSendContactFunction,
	setSendLocationFunction,
	setSendVoiceFunction,
	setUploadFunction,
} from "./tools/index.js";
import type { WhatsAppContext } from "./whatsapp.js";

export interface AgentRunner {
	run(ctx: WhatsAppContext, store: ChatStore): Promise<{ stopReason: string; errorMessage?: string }>;
	steer(text: string): void;
	abort(): void;
	lastContextTokens: number;
	lastMessageCount: number;
	contextWindow: number;
	modelInfo: ModelEntry;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
};

function getImageMimeType(filename: string): string | undefined {
	return IMAGE_MIME_TYPES[filename.toLowerCase().split(".").pop() || ""];
}

function getMemory(chatDir: string): string {
	const parts: string[] = [];

	const workspaceMemoryPath = join(chatDir, "..", "MEMORY.md");
	if (existsSync(workspaceMemoryPath)) {
		try {
			const content = readFileSync(workspaceMemoryPath, "utf-8").trim();
			if (content) {
				parts.push(`### Global Workspace Memory\n${content}`);
			}
		} catch (error) {
			log.logWarning("Failed to read workspace memory", `${workspaceMemoryPath}: ${error}`);
		}
	}

	const chatMemoryPath = join(chatDir, "MEMORY.md");
	if (existsSync(chatMemoryPath)) {
		try {
			const content = readFileSync(chatMemoryPath, "utf-8").trim();
			if (content) {
				parts.push(`### Chat-Specific Memory\n${content}`);
			}
		} catch (error) {
			log.logWarning("Failed to read chat memory", `${chatMemoryPath}: ${error}`);
		}
	}

	if (parts.length === 0) {
		return "(no working memory yet)";
	}

	return parts.join("\n\n");
}

function loadNvSkills(chatDir: string, workspacePath: string): Skill[] {
	const skillMap = new Map<string, Skill>();

	const workspaceSkillsDir = join(workspacePath, "skills");
	for (const skill of loadSkillsFromDir({ dir: workspaceSkillsDir, source: "workspace" }).skills) {
		skillMap.set(skill.name, skill);
	}

	const chatSkillsDir = join(chatDir, "skills");
	for (const skill of loadSkillsFromDir({ dir: chatSkillsDir, source: "chat" }).skills) {
		skillMap.set(skill.name, skill);
	}

	return Array.from(skillMap.values());
}

function getSoul(workspacePath: string): string {
	const soulPath = join(workspacePath, "SOUL.md");
	if (existsSync(soulPath)) {
		try {
			return readFileSync(soulPath, "utf-8").trim();
		} catch {}
	}
	return "";
}

function buildSystemPrompt(workspacePath: string, chatId: string, memory: string, skills: Skill[]): string {
	const chatPath = `${workspacePath}/${chatId}`;
	const soul = getSoul(workspacePath);

	return `${soul || "You are nv, a friendly WhatsApp assistant."}

## Context
- For current date/time, use: date
- You have access to previous conversation context including tool results from prior turns.
- For older history beyond your context, search log.jsonl.

## WhatsApp Formatting
Bold: *text*, Italic: _text_, Strikethrough: ~text~, Code: \`\`\`code\`\`\`
Monospace: \`\`\`text\`\`\`
Do NOT use **double asterisks** or [markdown](links).

## Environment
You are running directly on the host machine.
- Bash working directory: ${chatPath}/scratch/
- Store your working files there
- Be careful with system modifications

## Workspace Layout
${workspacePath}/
├── MEMORY.md                    # Global memory (all chats)
├── skills/                      # Global CLI tools you create
└── ${chatId}/                   # This chat
    ├── MEMORY.md                # Chat-specific memory
    ├── log.jsonl                # Message history (no tool results)
    ├── attachments/             # User-shared files
    ├── scratch/                 # Your working directory
    └── skills/                  # Chat-specific tools

## Skills (Custom CLI Tools)
You can create reusable CLI tools for recurring tasks.

### Creating Skills
Store in \`${workspacePath}/skills/<name>/\` (global) or \`${chatPath}/skills/<name>/\` (chat-specific).
Each skill directory needs a \`SKILL.md\` with YAML frontmatter:

\`\`\`markdown
---
name: skill-name
description: Short description of what this skill does
---

# Skill Name

Usage instructions, examples, etc.
Scripts are in: {baseDir}/
\`\`\`

### Available Skills
${skills.length > 0 ? formatSkillsForPrompt(skills) : "(no skills installed yet)"}

## Events
You can schedule events that wake you up at specific times. Events are JSON files in \`${workspacePath}/events/\`.

### Event Types

**Immediate** - Triggers as soon as file is created.
\`\`\`json
{"type": "immediate", "chatId": "${chatId}", "text": "Something happened"}
\`\`\`

**One-shot** - Triggers once at a specific time.
\`\`\`json
{"type": "one-shot", "chatId": "${chatId}", "text": "Reminder", "at": "2025-12-15T09:00:00+01:00"}
\`\`\`

**Periodic** - Triggers on a cron schedule.
\`\`\`json
{"type": "periodic", "chatId": "${chatId}", "text": "Check inbox", "schedule": "0 9 * * 1-5", "timezone": "${Intl.DateTimeFormat().resolvedOptions().timeZone}"}
\`\`\`

### Timezones
All \`at\` timestamps must include offset. Periodic events use IANA timezone names. Default: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.

### Creating Events
\`\`\`bash
cat > ${workspacePath}/events/reminder-$(date +%s).json << 'EOF'
{"type": "one-shot", "chatId": "${chatId}", "text": "Dentist tomorrow", "at": "2025-12-14T09:00:00+01:00"}
EOF
\`\`\`

### Managing Events
- List: \`ls ${workspacePath}/events/\`
- Delete/cancel: \`rm ${workspacePath}/events/foo.json\`

### Silent Completion
For periodic events where there's nothing to report, respond with just \`[SILENT]\` (no other text).

### Limits
Maximum 5 events can be queued.

## Memory
Write to MEMORY.md files to persist context across conversations.
- Global (${workspacePath}/MEMORY.md): skills, preferences, project info
- Chat (${chatPath}/MEMORY.md): chat-specific decisions, ongoing work
Update when you learn something important or when asked to remember something.

### Current Memory
${memory}

## Log Queries (for older history)
Format: \`{"date":"...","ts":"...","user":"...","userName":"...","text":"...","isBot":false}\`

\`\`\`bash
# Recent messages
tail -30 log.jsonl | jq -c '{date: .date[0:19], user: (.userName // .user), text}'

# Search for specific topic
grep -i "topic" log.jsonl | jq -c '{date: .date[0:19], user: (.userName // .user), text}'
\`\`\`

## System Configuration Log
Maintain ${workspacePath}/SYSTEM.md to log all environment modifications:
- Installed packages (brew, npm, pip, apt, etc.)
- Environment variables set
- Config files modified (~/.gitconfig, cron jobs, etc.)
- Skill dependencies installed

Update this file whenever you modify the environment. If the system is ever reset, read it first to restore your setup.

## Tools
- bash: Run shell commands (primary tool). Install packages as needed.
- read: Read files
- write: Create/overwrite files
- edit: Surgical file edits
- attach: Send files via WhatsApp (images, GIFs, videos, audio, documents). Download first with bash if needed.
- web_search: Search the web for information
- web_fetch: Fetch and read a web page as markdown
- tts: Convert text to speech and send as a WhatsApp voice note. Use when asked for voice replies or reading aloud.
- react: React to the current message with an emoji. Use sparingly.
- reply: Reply to a specific message (quoted reply). Use when answering multiple questions in separate bubbles.
- send_location: Send a location pin.
- send_contact: Send a contact card.

Each tool requires a "label" parameter (shown to user).
`;
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function extractToolResultText(result: unknown): string {
	if (typeof result === "string") {
		return result;
	}

	if (
		result &&
		typeof result === "object" &&
		"content" in result &&
		Array.isArray((result as { content: unknown }).content)
	) {
		const content = (result as { content: Array<{ type: string; text?: string }> }).content;
		const textParts: string[] = [];
		for (const part of content) {
			if (part.type === "text" && part.text) {
				textParts.push(part.text);
			}
		}
		if (textParts.length > 0) {
			return textParts.join("\n");
		}
	}

	return JSON.stringify(result);
}

// Cache runners per chat
const chatRunners = new Map<string, AgentRunner>();

export function getOrCreateRunner(
	chatId: string,
	chatDir: string,
	workingDir: string,
	model: Model<any>,
	modelEntry: ModelEntry,
): AgentRunner {
	const existing = chatRunners.get(chatId);
	if (existing) return existing;

	const runner = createRunner(chatId, chatDir, workingDir, model, modelEntry);
	chatRunners.set(chatId, runner);
	return runner;
}

export function resetRunner(chatId: string): void {
	chatRunners.delete(chatId);
}

function createRunner(
	chatId: string,
	chatDir: string,
	workingDir: string,
	model: Model<any>,
	modelEntry: ModelEntry,
): AgentRunner {
	const scratchDir = join(chatDir, "scratch");
	mkdirSync(scratchDir, { recursive: true });
	const tools = createNvTools(scratchDir);

	const memory = getMemory(chatDir);
	const skills = loadNvSkills(chatDir, workingDir);
	const systemPrompt = buildSystemPrompt(workingDir, chatId, memory, skills);

	const contextFile = join(chatDir, "context.jsonl");
	const sessionManager = SessionManager.open(contextFile, chatDir);
	const settingsManager = createNvSettingsManager(workingDir);

	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	const modelRegistry = new ModelRegistry(authStorage);

	const agent = new Agent({
		initialState: {
			systemPrompt,
			model,
			thinkingLevel: "medium",
			tools,
		},
		convertToLlm,
		getApiKey: async (provider?: string) => {
			const key = await modelRegistry.getApiKeyForProvider(provider || modelEntry.provider);
			if (!key) {
				throw new Error(
					`Authentication failed for "${provider || modelEntry.provider}". ` +
						"Credentials may have expired or network is unavailable. " +
						`Run 'nv --login ${provider || modelEntry.provider}' to re-authenticate.`,
				);
			}
			return key;
		},
		steeringMode: "one-at-a-time",
		followUpMode: "all",
	});

	const loadedSession = sessionManager.buildSessionContext();
	if (loadedSession.messages.length > 0) {
		agent.replaceMessages(loadedSession.messages);
		log.logInfo(`[${chatId}] Loaded ${loadedSession.messages.length} messages from context.jsonl`);
	}

	const resourceLoader: ResourceLoader = {
		getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => [],
		getPathMetadata: () => new Map(),
		extendResources: () => {},
		reload: async () => {},
	};

	const baseToolsOverride = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: process.cwd(),
		modelRegistry,
		resourceLoader,
		baseToolsOverride,
	});

	// Mutable per-run state
	const runState = {
		ctx: null as WhatsAppContext | null,
		logCtx: null as { chatId: string; contactName?: string } | null,
		pendingTools: new Map<string, { toolName: string; args: unknown; startTime: number }>(),
		totalUsage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		errorMessage: undefined as string | undefined,
		responseSent: false,
	};

	// Subscribe to events ONCE
	session.subscribe(async (event) => {
		if (!runState.ctx || !runState.logCtx) return;

		const { logCtx, pendingTools } = runState;

		if (event.type === "tool_execution_start") {
			const agentEvent = event as AgentEvent & { type: "tool_execution_start" };
			const args = agentEvent.args as { label?: string };
			const label = args.label || agentEvent.toolName;

			pendingTools.set(agentEvent.toolCallId, {
				toolName: agentEvent.toolName,
				args: agentEvent.args,
				startTime: Date.now(),
			});

			log.logToolStart(logCtx, agentEvent.toolName, label, agentEvent.args as Record<string, unknown>);
		} else if (event.type === "tool_execution_end") {
			const agentEvent = event as AgentEvent & { type: "tool_execution_end" };
			const resultStr = extractToolResultText(agentEvent.result);
			const pending = pendingTools.get(agentEvent.toolCallId);
			pendingTools.delete(agentEvent.toolCallId);

			const durationMs = pending ? Date.now() - pending.startTime : 0;

			if (agentEvent.isError) {
				log.logToolError(logCtx, agentEvent.toolName, durationMs, resultStr);
			} else {
				log.logToolSuccess(logCtx, agentEvent.toolName, durationMs, resultStr);
			}
		} else if (event.type === "message_start") {
			const agentEvent = event as AgentEvent & { type: "message_start" };
			if (agentEvent.message.role === "assistant") {
				log.logResponseStart(logCtx);
			}
		} else if (event.type === "message_end") {
			const agentEvent = event as AgentEvent & { type: "message_end" };
			if (agentEvent.message.role === "assistant") {
				const assistantMsg = agentEvent.message as any;

				if (assistantMsg.stopReason) {
					runState.stopReason = assistantMsg.stopReason;
				}
				if (assistantMsg.errorMessage) {
					runState.errorMessage = assistantMsg.errorMessage;
				}

				if (assistantMsg.usage) {
					runState.totalUsage.input += assistantMsg.usage.input;
					runState.totalUsage.output += assistantMsg.usage.output;
					runState.totalUsage.cacheRead += assistantMsg.usage.cacheRead;
					runState.totalUsage.cacheWrite += assistantMsg.usage.cacheWrite;
					runState.totalUsage.cost.input += assistantMsg.usage.cost.input;
					runState.totalUsage.cost.output += assistantMsg.usage.cost.output;
					runState.totalUsage.cost.cacheRead += assistantMsg.usage.cost.cacheRead;
					runState.totalUsage.cost.cacheWrite += assistantMsg.usage.cost.cacheWrite;
					runState.totalUsage.cost.total += assistantMsg.usage.cost.total;
				}

				const content = agentEvent.message.content;
				const thinkingParts: string[] = [];
				const textParts: string[] = [];
				for (const part of content) {
					if (part.type === "thinking") {
						thinkingParts.push((part as any).thinking);
					} else if (part.type === "text") {
						textParts.push((part as any).text);
					}
				}

				for (const thinking of thinkingParts) {
					log.logThinking(logCtx, thinking);
				}

				const text = textParts.join("\n");
				if (text.trim()) {
					log.logResponse(logCtx, text);

					// Send text immediately — don't wait for tools to finish
					if (runState.ctx && text.trim() !== "[SILENT]" && !text.trim().startsWith("[SILENT]")) {
						runState.ctx.respond(text).catch(() => {});
						runState.responseSent = true;
					}
				}
			}
		} else if (event.type === "auto_compaction_start") {
			log.logInfo(`Auto-compaction started (reason: ${(event as any).reason})`);
		} else if (event.type === "auto_compaction_end") {
			const compEvent = event as any;
			if (compEvent.result) {
				log.logInfo(`Auto-compaction complete: ${compEvent.result.tokensBefore} tokens compacted`);
			} else if (compEvent.aborted) {
				log.logInfo("Auto-compaction aborted");
			}
		} else if (event.type === "auto_retry_start") {
			const retryEvent = event as any;
			log.logWarning(`Retrying (${retryEvent.attempt}/${retryEvent.maxAttempts})`, retryEvent.errorMessage);
		}
	});

	const runner: AgentRunner = {
		async run(ctx: WhatsAppContext, _store: ChatStore): Promise<{ stopReason: string; errorMessage?: string }> {
			await mkdir(chatDir, { recursive: true });

			const syncedCount = syncLogToSessionManager(sessionManager, chatDir, ctx.message.ts);
			if (syncedCount > 0) {
				log.logInfo(`[${chatId}] Synced ${syncedCount} messages from log.jsonl`);
			}

			const reloadedSession = sessionManager.buildSessionContext();
			if (reloadedSession.messages.length > 0) {
				agent.replaceMessages(reloadedSession.messages);
				runner.lastMessageCount = reloadedSession.messages.length;
				log.logInfo(`[${chatId}] Reloaded ${reloadedSession.messages.length} messages from context`);
			}

			const memory = getMemory(chatDir);
			const skills = loadNvSkills(chatDir, workingDir);
			const systemPrompt = buildSystemPrompt(workingDir, chatId, memory, skills);
			session.agent.setSystemPrompt(systemPrompt);

			setUploadFunction(async (filePath: string, title?: string) => {
				await ctx.sendFile(filePath, title);
			});

			setSendVoiceFunction(async (filePath: string) => {
				await ctx.sendVoice(filePath);
			});

			setReactFunction(async (emoji: string) => {
				await ctx.react(emoji);
			});

			setReplyFunction(async (messageId: string, text: string) => {
				await ctx.reply(messageId, text);
			});

			setSendLocationFunction(async (lat: number, lng: number, name?: string) => {
				await ctx.sendLocation(lat, lng, name);
			});

			setSendContactFunction(async (name: string, phone: string) => {
				await ctx.sendContact(name, phone);
			});

			// Reset per-run state
			runState.ctx = ctx;
			runState.logCtx = {
				chatId: ctx.message.chatId,
				contactName: ctx.message.user,
			};
			runState.pendingTools.clear();
			runState.totalUsage = {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			};
			runState.stopReason = "stop";
			runState.errorMessage = undefined;
			runState.responseSent = false;

			log.logInfo(`Context sizes - system: ${systemPrompt.length} chars, memory: ${memory.length} chars`);

			// Build user message with timestamp
			const now = new Date();
			const pad = (n: number) => n.toString().padStart(2, "0");
			const offset = -now.getTimezoneOffset();
			const offsetSign = offset >= 0 ? "+" : "-";
			const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
			const offsetMins = pad(Math.abs(offset) % 60);
			const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${offsetSign}${offsetHours}:${offsetMins}`;
			let userMessage = `[${timestamp}] [${ctx.message.user || "unknown"}]: ${ctx.message.text}`;

			const imageAttachments: ImageContent[] = [];
			const nonImagePaths: string[] = [];

			for (const a of ctx.message.attachments || []) {
				const fullPath = `${workingDir}/${a.local}`;
				const mimeType = getImageMimeType(a.local);

				if (mimeType && existsSync(fullPath)) {
					try {
						imageAttachments.push({
							type: "image",
							mimeType,
							data: readFileSync(fullPath).toString("base64"),
						});
					} catch {
						nonImagePaths.push(fullPath);
					}
				} else {
					nonImagePaths.push(fullPath);
				}
			}

			if (nonImagePaths.length > 0) {
				userMessage += `\n\n<attachments>\n${nonImagePaths.join("\n")}\n</attachments>`;
			}

			// Debug: write context to last_prompt.jsonl
			const debugContext = {
				systemPrompt,
				messages: session.messages,
				newUserMessage: userMessage,
				imageAttachmentCount: imageAttachments.length,
			};
			await writeFile(join(chatDir, "last_prompt.jsonl"), JSON.stringify(debugContext, null, 2));

			// Show typing while working
			await ctx.setTyping(true);

			await session.prompt(userMessage, imageAttachments.length > 0 ? { images: imageAttachments } : undefined);

			// Handle error case
			if (runState.stopReason === "error" && runState.errorMessage) {
				try {
					await ctx.respond("Sorry, something went wrong.");
				} catch (err) {
					const errMsg = err instanceof Error ? err.message : String(err);
					log.logWarning("Failed to send error message", errMsg);
				}
			} else if (!runState.responseSent) {
				// Send final response only if not already sent via streaming
				const messages = session.messages;
				const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
				const finalText =
					lastAssistant?.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n") || "";

				// Check for [SILENT] marker
				if (finalText.trim() === "[SILENT]" || finalText.trim().startsWith("[SILENT]")) {
					log.logInfo("Silent response - not sending to WhatsApp");
				} else if (finalText.trim()) {
					try {
						await ctx.respond(finalText);
					} catch (err) {
						const errMsg = err instanceof Error ? err.message : String(err);
						log.logWarning("Failed to send response", errMsg);
					}
				}
			}

			// Log usage summary
			if (runState.totalUsage.cost.total > 0 && runState.logCtx) {
				const messages = session.messages;
				const lastAssistantMessage = messages
					.slice()
					.reverse()
					.find((m) => m.role === "assistant" && (m as any).stopReason !== "aborted") as any;

				const contextTokens = lastAssistantMessage
					? lastAssistantMessage.usage.input +
						lastAssistantMessage.usage.output +
						lastAssistantMessage.usage.cacheRead +
						lastAssistantMessage.usage.cacheWrite
					: 0;
				const contextWindow = model.contextWindow || 200000;
				const pct = ((contextTokens / contextWindow) * 100).toFixed(1);

				log.logUsageSummary(runState.logCtx, runState.totalUsage, contextTokens, contextWindow);
				log.logInfo(
					`[${chatId}] Context: ${formatTokens(contextTokens)} / ${formatTokens(contextWindow)} (${pct}%) | Cost: $${runState.totalUsage.cost.total.toFixed(4)}`,
				);
				runner.lastContextTokens = contextTokens;
			}

			// Clear run state
			runState.ctx = null;
			runState.logCtx = null;

			return { stopReason: runState.stopReason, errorMessage: runState.errorMessage };
		},

		steer(text: string): void {
			const now = new Date();
			const pad = (n: number) => n.toString().padStart(2, "0");
			const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
			agent.steer({
				role: "user",
				content: [{ type: "text", text: `[${timestamp}] ${text}` }],
				timestamp: Date.now(),
			});
		},

		abort(): void {
			session.abort();
		},

		lastContextTokens: 0,
		lastMessageCount: 0,
		contextWindow: model.contextWindow || 1000000,
		modelInfo: modelEntry,
	};

	return runner;
}
