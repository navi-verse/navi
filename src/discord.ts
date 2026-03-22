import {
	Client,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
	type Message,
	Partials,
	type ThreadChannel,
} from "discord.js";
import { readFileSync } from "fs";
import * as log from "./log.js";
import type { ChatStore } from "./store.js";

// ============================================================================
// Types (mirrors whatsapp.ts interfaces)
// ============================================================================

export interface DiscordEvent {
	chatId: string;
	ts: string;
	user: string;
	text: string;
	messageId: string;
	attachments: Array<{ local: string }>;
}

export interface DiscordContext {
	message: {
		text: string;
		user: string;
		chatId: string;
		ts: string;
		attachments: Array<{ local: string }>;
	};
	respond: (text: string, shouldLog?: boolean) => Promise<void>;
	setTyping: (isTyping: boolean) => Promise<void>;
	sendFile: (filePath: string, title?: string) => Promise<void>;
	sendVoice: (filePath: string) => Promise<void>;
	react: (emoji: string) => Promise<void>;
	reply: (messageId: string, text: string) => Promise<void>;
	respondInThread: (text: string) => Promise<void>;
	sendLocation: (lat: number, lng: number, name?: string) => Promise<void>;
	sendContact: (name: string, phone: string) => Promise<void>;
}

export interface DiscordHandler {
	isRunning(chatId: string): boolean;
	handleEvent(event: DiscordEvent, bot: DiscordBot, isEvent?: boolean): Promise<void>;
	handleSteer(chatId: string, text: string): void;
	handleStop(chatId: string, bot: DiscordBot): Promise<void>;
	handleNew(chatId: string, bot: DiscordBot): void;
	handleStatus(chatId: string, bot: DiscordBot): void;
	handleModel(chatId: string, bot: DiscordBot, args?: string): void;
	handleHelp(chatId: string, bot: DiscordBot): void;
}

// ============================================================================
// Per-channel queue
// ============================================================================

type QueuedWork = () => Promise<void>;

class ChannelQueue {
	private queue: QueuedWork[] = [];
	private processing = false;

	enqueue(work: QueuedWork): void {
		this.queue.push(work);
		this.processNext();
	}

	size(): number {
		return this.queue.length;
	}

	private async processNext(): Promise<void> {
		if (this.processing || this.queue.length === 0) return;
		this.processing = true;
		const work = this.queue.shift()!;
		try {
			await work();
		} catch (err) {
			log.logWarning("Queue error", err instanceof Error ? err.message : String(err));
		}
		this.processing = false;
		this.processNext();
	}
}

// ============================================================================
// DiscordBot
// ============================================================================

export class DiscordBot {
	private client: Client;
	private handler: DiscordHandler;
	private workingDir: string;
	private store: ChatStore;
	private queues = new Map<string, ChannelQueue>();
	private lastMessage = new Map<string, Message>();
	private activeThreads = new Map<string, ThreadChannel>();
	private botMessages = new Map<string, Message>(); // For live editing

	constructor(handler: DiscordHandler, config: { workingDir: string; store: ChatStore; token: string }) {
		this.handler = handler;
		this.workingDir = config.workingDir;
		this.store = config.store;

		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.MessageContent,
			],
			partials: [Partials.Channel, Partials.Message],
		});

		this.client.on(Events.MessageCreate, (msg) => this.handleMessage(msg));

		this.client.once(Events.ClientReady, (c) => {
			log.logInfo(`Discord connected as ${c.user.tag}`);
		});

		this.client.login(config.token);
	}

	private async handleMessage(msg: Message): Promise<void> {
		// Skip bot messages
		if (msg.author.bot) return;

		const chatId = `discord:${msg.channelId}`;
		const text = msg.content;
		const user = msg.author.displayName || msg.author.username;
		const ts = msg.createdTimestamp.toString();

		if (!text && msg.attachments.size === 0) return;

		// Download attachments
		const attachments: Array<{ local: string }> = [];
		for (const [, attachment] of msg.attachments) {
			try {
				const response = await fetch(attachment.url);
				const buffer = Buffer.from(await response.arrayBuffer());
				const saved = await this.store.saveAttachment(chatId, attachment.name || "file", buffer, ts);
				attachments.push({ local: saved.local });
			} catch (err) {
				log.logWarning("Failed to download Discord attachment", err instanceof Error ? err.message : String(err));
			}
		}

		const displayText = text || "(media)";

		const event: DiscordEvent = {
			chatId,
			ts,
			user,
			text: displayText,
			messageId: msg.id,
			attachments,
		};

		// Log message
		this.store.logToFileSync(chatId, {
			date: new Date(msg.createdTimestamp).toISOString(),
			ts,
			user: msg.author.id,
			userName: user,
			text: displayText,
			attachments: attachments.map((a) => ({ original: a.local.split("/").pop() || "", local: a.local })),
			isBot: false,
		});

		log.logUserMessage({ chatId, contactName: user }, displayText.substring(0, 100));

		// Store message reference for replies
		this.lastMessage.set(chatId, msg);

		// Commands
		const cmd = text.trim().toLowerCase();
		if (cmd === "stop") {
			if (this.handler.isRunning(chatId)) {
				this.handler.handleStop(chatId, this);
			} else {
				this.sendMessage(chatId, "_Nothing running_");
			}
			return;
		}
		if (cmd === "/new") {
			this.handler.handleNew(chatId, this);
			return;
		}
		if (cmd === "/status") {
			this.handler.handleStatus(chatId, this);
			return;
		}
		if (cmd === "/help") {
			this.handler.handleHelp(chatId, this);
			return;
		}
		if (cmd === "/model" || cmd.startsWith("/model ")) {
			this.handler.handleModel(chatId, this, text.trim().substring(6).trim() || undefined);
			return;
		}

		// Steer or queue
		if (this.handler.isRunning(chatId)) {
			this.handler.handleSteer(chatId, displayText);
			log.logInfo(`[${chatId}] Steered running agent: ${displayText.substring(0, 50)}`);
		} else {
			this.getQueue(chatId).enqueue(() => this.handler.handleEvent(event, this));
		}
	}

	private getQueue(chatId: string): ChannelQueue {
		let queue = this.queues.get(chatId);
		if (!queue) {
			queue = new ChannelQueue();
			this.queues.set(chatId, queue);
		}
		return queue;
	}

	// ==========================================================================
	// Public API
	// ==========================================================================

	async sendMessage(chatId: string, text: string): Promise<string> {
		const channelId = chatId.replace("discord:", "");
		const channel = await this.client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !("send" in channel)) throw new Error("Not a text channel");

		// Discord has 2000 char limit — split if needed
		const chunks = this.splitMessage(text);
		let lastId = "";
		for (const chunk of chunks) {
			const sent = await channel.send(chunk);
			lastId = sent.id;
			this.botMessages.set(chatId, sent);
		}
		return lastId;
	}

	/**
	 * Edit the bot's current message in place (live progress).
	 * Creates a new message if none exists yet.
	 */
	async editOrSend(chatId: string, text: string): Promise<string> {
		const existing = this.botMessages.get(chatId);
		const truncated = text.length > 2000 ? `${text.substring(0, 1997)}...` : text;

		if (existing) {
			try {
				await existing.edit(truncated);
				return existing.id;
			} catch {
				// Edit failed — send new
			}
		}
		return this.sendMessage(chatId, truncated);
	}

	/**
	 * Set working indicator on the current message.
	 */
	async setWorking(chatId: string, working: boolean): Promise<void> {
		const msg = this.botMessages.get(chatId);
		if (!msg) return;
		try {
			if (working) {
				await msg.edit(`${msg.content} ...`);
			} else {
				const content = msg.content.replace(/ \.\.\.$/, "");
				await msg.edit(content);
			}
		} catch {
			// Ignore edit errors
		}
	}

	clearBotMessage(chatId: string): void {
		this.botMessages.delete(chatId);
	}

	/**
	 * Send a rich embed (colored card with fields).
	 * Used for /status, search results, tool summaries.
	 */
	async sendEmbed(
		chatId: string,
		options: {
			title: string;
			description?: string;
			color?: number;
			fields?: Array<{ name: string; value: string; inline?: boolean }>;
			footer?: string;
		},
	): Promise<string> {
		const channelId = chatId.replace("discord:", "");
		const channel = await this.client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !("send" in channel)) throw new Error("Not a text channel");

		const embed = new EmbedBuilder().setTitle(options.title).setColor(options.color ?? 0x7c3aed);

		if (options.description) embed.setDescription(options.description);
		if (options.fields) {
			for (const field of options.fields) {
				embed.addFields({ name: field.name, value: field.value, inline: field.inline ?? false });
			}
		}
		if (options.footer) embed.setFooter({ text: options.footer });

		const sent = await channel.send({ embeds: [embed] });
		return sent.id;
	}

	/**
	 * Send a usage summary embed to a thread.
	 */
	async sendUsageEmbed(
		chatId: string,
		usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: { total: number } },
		contextTokens: number,
		contextWindow: number,
	): Promise<void> {
		const thread = this.activeThreads.get(chatId);
		if (!thread) return;

		const pct = ((contextTokens / contextWindow) * 100).toFixed(1);
		const embed = new EmbedBuilder()
			.setTitle("Usage")
			.setColor(0x22c55e)
			.addFields(
				{
					name: "Tokens",
					value: `${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out`,
					inline: true,
				},
				{ name: "Context", value: `${pct}%`, inline: true },
				{ name: "Cost", value: `$${usage.cost.total.toFixed(4)}`, inline: true },
			);

		if (usage.cacheRead > 0 || usage.cacheWrite > 0) {
			embed.addFields({
				name: "Cache",
				value: `${usage.cacheRead.toLocaleString()} read / ${usage.cacheWrite.toLocaleString()} write`,
				inline: true,
			});
		}

		await thread.send({ embeds: [embed] });
	}

	async sendFile(chatId: string, filePath: string, _title?: string): Promise<void> {
		const channelId = chatId.replace("discord:", "");
		const channel = await this.client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !("send" in channel)) throw new Error("Not a text channel");

		const data = readFileSync(filePath);
		const fileName = filePath.split("/").pop() || "file";
		await channel.send({ files: [{ attachment: data, name: fileName }] });
	}

	async sendTyping(chatId: string): Promise<void> {
		try {
			const channelId = chatId.replace("discord:", "");
			const channel = await this.client.channels.fetch(channelId);
			if (channel?.isTextBased() && "sendTyping" in channel) {
				await channel.sendTyping();
			}
		} catch {
			// Ignore
		}
	}

	async reactToMessage(chatId: string, _messageId: string, emoji: string): Promise<void> {
		const msg = this.lastMessage.get(chatId);
		if (msg) {
			try {
				await msg.react(emoji);
			} catch {
				// Ignore reaction errors
			}
		}
	}

	async replyToMessage(chatId: string, _messageId: string, text: string): Promise<string> {
		const msg = this.lastMessage.get(chatId);
		if (msg) {
			const sent = await msg.reply(text);
			return sent.id;
		}
		return this.sendMessage(chatId, text);
	}

	async ensureThread(chatId: string, parentMessageId: string): Promise<ThreadChannel> {
		const existing = this.activeThreads.get(chatId);
		if (existing) return existing;

		const channelId = chatId.replace("discord:", "");
		const channel = await this.client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !("messages" in channel)) throw new Error("Not a text channel");

		const parentMsg = await channel.messages.fetch(parentMessageId);
		const thread = await parentMsg.startThread({
			name: "Details",
			autoArchiveDuration: 60,
		});
		this.activeThreads.set(chatId, thread);
		return thread;
	}

	async sendInThread(chatId: string, text: string): Promise<void> {
		const thread = this.activeThreads.get(chatId);
		if (!thread) return;

		const chunks = this.splitMessage(text);
		for (const chunk of chunks) {
			await thread.send(chunk);
		}
	}

	clearThread(chatId: string): void {
		this.activeThreads.delete(chatId);
	}

	logBotResponse(chatId: string, text: string, ts: string): void {
		this.store.logToFileSync(chatId, {
			date: new Date().toISOString(),
			ts,
			user: "bot",
			text,
			attachments: [],
			isBot: true,
		});
	}

	enqueueEvent(event: DiscordEvent): boolean {
		const queue = this.getQueue(event.chatId);
		if (queue.size() >= 5) {
			log.logWarning(`Event queue full for ${event.chatId}`);
			return false;
		}
		queue.enqueue(() => this.handler.handleEvent(event, this, true));
		return true;
	}

	private splitMessage(text: string): string[] {
		if (text.length <= 2000) return [text];
		const chunks: string[] = [];
		let remaining = text;
		while (remaining.length > 0) {
			chunks.push(remaining.substring(0, 2000));
			remaining = remaining.substring(2000);
		}
		return chunks;
	}
}
