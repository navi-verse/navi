import makeWASocket, {
	type BaileysEventMap,
	Browsers,
	DisconnectReason,
	downloadMediaMessage,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
	type WAMessage,
	type WASocket,
} from "baileys";
import { readFileSync } from "fs";
import { join } from "path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import * as log from "./log.js";
import { transcribeAudio } from "./transcribe.js";

const waLogger = pino({ level: "silent" });

import type { ChatStore } from "./store.js";

// ============================================================================
// Types
// ============================================================================

export interface WhatsAppEvent {
	chatId: string;
	ts: string;
	user: string;
	text: string;
	attachments: Array<{ local: string }>;
}

export interface WhatsAppContext {
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
}

export interface NvHandler {
	isRunning(chatId: string): boolean;
	handleEvent(event: WhatsAppEvent, bot: WhatsAppBot, isEvent?: boolean): Promise<void>;
	handleSteer(chatId: string, text: string): void;
	handleStop(chatId: string, bot: WhatsAppBot): Promise<void>;
}

// ============================================================================
// Per-chat queue for sequential processing
// ============================================================================

type QueuedWork = () => Promise<void>;

class ChatQueue {
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
// WhatsAppBot
// ============================================================================

export class WhatsAppBot {
	private sock: WASocket | null = null;
	private handler: NvHandler;
	private workingDir: string;
	private store: ChatStore;
	private queues = new Map<string, ChatQueue>();
	private authDir: string;

	constructor(handler: NvHandler, config: { workingDir: string; store: ChatStore }) {
		this.handler = handler;
		this.workingDir = config.workingDir;
		this.store = config.store;
		this.authDir = join(config.workingDir, "wa-auth");
	}

	async start(): Promise<void> {
		await this.connect();
	}

	private async connect(): Promise<void> {
		const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
		const { version } = await fetchLatestBaileysVersion();

		const sock = makeWASocket({
			version,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, waLogger as any),
			},
			browser: Browsers.macOS("Chrome"),
			logger: waLogger as any,
			generateHighQualityLinkPreview: false,
		});

		this.sock = sock;

		sock.ev.on("creds.update", saveCreds);

		sock.ev.on("connection.update", (update) => {
			const { connection, lastDisconnect, qr } = update;

			if (qr) {
				qrcode.generate(qr, { small: true });
				log.logInfo("Scan the QR code above with WhatsApp to connect");
			}

			if (connection === "open") {
				log.logConnected();
			}

			if (connection === "close") {
				const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
				const errorMsg = lastDisconnect?.error?.message || "unknown";
				const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

				log.logInfo(`Connection closed (status: ${statusCode}, reason: ${errorMsg})`);

				if (shouldReconnect) {
					log.logInfo("Reconnecting in 3s...");
					setTimeout(() => this.connect(), 3000);
				} else {
					log.logInfo("Logged out. Delete wa-auth/ directory and restart to re-authenticate.");
				}
			}
		});

		sock.ev.on("messages.upsert", (event: BaileysEventMap["messages.upsert"]) => {
			if (event.type !== "notify") return;

			for (const msg of event.messages) {
				this.handleMessage(msg);
			}
		});
	}

	private async handleMessage(msg: WAMessage): Promise<void> {
		if (!msg.message || !msg.key.remoteJid) return;

		// Skip own messages
		if (msg.key.fromMe) return;

		// Mark as read (blue ticks)
		try {
			await this.sock!.readMessages([msg.key]);
		} catch {
			// Ignore read receipt errors
		}

		const chatId = msg.key.remoteJid;
		const isGroup = chatId.endsWith("@g.us");
		const ts = ((msg.messageTimestamp as number) || Math.floor(Date.now() / 1000)).toString();
		const pushName =
			msg.pushName || (isGroup ? msg.key.participant || chatId : chatId.replace("@s.whatsapp.net", ""));

		const text = this.extractText(msg);
		const hasMedia = this.hasMedia(msg);

		// Skip messages with no text and no media
		if (!text && !hasMedia) return;

		// Download media if present
		const attachments: Array<{ local: string }> = [];
		let transcription: string | null = null;
		if (hasMedia) {
			try {
				const { fileName, data } = await this.downloadMedia(msg);
				const attachment = await this.store.saveAttachment(chatId, fileName, data, ts);
				attachments.push({ local: attachment.local });
				log.logInfo(`[${chatId}] Downloaded attachment: ${fileName}`);

				// Transcribe voice/audio messages
				if (this.isVoiceMessage(msg)) {
					const fullPath = join(this.workingDir, attachment.local);
					transcription = await transcribeAudio(fullPath);
					if (transcription) {
						log.logInfo(`[${chatId}] Transcribed: ${transcription.substring(0, 80)}`);
					}
				}
			} catch (err) {
				log.logWarning("Failed to download media", err instanceof Error ? err.message : String(err));
			}
		}

		let displayText: string;
		if (transcription) {
			displayText = text ? `${text}\n(voice): ${transcription}` : `(voice): ${transcription}`;
		} else {
			displayText = text || "(media)";
		}

		const waEvent: WhatsAppEvent = {
			chatId,
			ts,
			user: pushName,
			text: displayText,
			attachments,
		};

		// Log the message
		this.store.logToFileSync(chatId, {
			date: new Date(Number.parseInt(ts, 10) * 1000).toISOString(),
			ts,
			user: isGroup ? msg.key.participant || chatId : chatId,
			userName: pushName,
			text: displayText,
			attachments: attachments.map((a) => ({ original: a.local.split("/").pop() || "", local: a.local })),
			isBot: false,
		});

		log.logUserMessage({ chatId, contactName: pushName }, displayText.substring(0, 100));

		// Handle stop command
		if (text && text.toLowerCase().trim() === "stop") {
			if (this.handler.isRunning(chatId)) {
				this.handler.handleStop(chatId, this);
			} else {
				this.sendMessage(chatId, "_Nothing running_");
			}
			return;
		}

		// If busy, steer the running agent with the new message
		if (this.handler.isRunning(chatId)) {
			this.handler.handleSteer(chatId, displayText);
			log.logInfo(`[${chatId}] Steered running agent: ${displayText.substring(0, 50)}`);
		} else {
			this.getQueue(chatId).enqueue(() => this.handler.handleEvent(waEvent, this));
		}
	}

	private extractText(msg: WAMessage): string | null {
		const m = msg.message;
		if (!m) return null;

		if (m.conversation) return m.conversation;
		if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
		if (m.imageMessage?.caption) return m.imageMessage.caption;
		if (m.videoMessage?.caption) return m.videoMessage.caption;
		if (m.documentMessage?.caption) return m.documentMessage.caption;
		if (m.documentWithCaptionMessage?.message?.documentMessage?.caption) {
			return m.documentWithCaptionMessage.message.documentMessage.caption;
		}

		return null;
	}

	private isVoiceMessage(msg: WAMessage): boolean {
		const m = msg.message;
		if (!m) return false;
		return !!m.audioMessage;
	}

	private hasMedia(msg: WAMessage): boolean {
		const m = msg.message;
		if (!m) return false;
		return !!(
			m.imageMessage ||
			m.videoMessage ||
			m.audioMessage ||
			m.documentMessage ||
			m.stickerMessage ||
			m.documentWithCaptionMessage?.message?.documentMessage
		);
	}

	private async downloadMedia(msg: WAMessage): Promise<{ fileName: string; data: Buffer }> {
		const m = msg.message!;

		let fileName = "file";
		if (m.imageMessage) {
			fileName = m.imageMessage.caption || `image_${Date.now()}.jpg`;
			if (!fileName.includes(".")) fileName += ".jpg";
		} else if (m.videoMessage) {
			fileName = m.videoMessage.caption || `video_${Date.now()}.mp4`;
			if (!fileName.includes(".")) fileName += ".mp4";
		} else if (m.audioMessage) {
			fileName = `audio_${Date.now()}.${m.audioMessage.ptt ? "ogg" : "mp3"}`;
		} else if (m.documentMessage) {
			fileName = m.documentMessage.fileName || `doc_${Date.now()}`;
		} else if (m.documentWithCaptionMessage?.message?.documentMessage) {
			fileName = m.documentWithCaptionMessage.message.documentMessage.fileName || `doc_${Date.now()}`;
		} else if (m.stickerMessage) {
			fileName = `sticker_${Date.now()}.webp`;
		}

		// Sanitize filename
		fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

		const buffer = await downloadMediaMessage(msg, "buffer", {});
		return { fileName, data: buffer as Buffer };
	}

	private getQueue(chatId: string): ChatQueue {
		let queue = this.queues.get(chatId);
		if (!queue) {
			queue = new ChatQueue();
			this.queues.set(chatId, queue);
		}
		return queue;
	}

	// ==========================================================================
	// Public API
	// ==========================================================================

	async sendMessage(chatId: string, text: string): Promise<string> {
		if (!this.sock) throw new Error("Not connected");
		const result = await this.sock.sendMessage(chatId, { text });
		return result?.key.id || Date.now().toString();
	}

	async sendFile(chatId: string, filePath: string, title?: string): Promise<void> {
		if (!this.sock) throw new Error("Not connected");

		const data = readFileSync(filePath);
		const fileName = title || filePath.split("/").pop() || "file";

		// Detect mime type by extension
		const ext = filePath.split(".").pop()?.toLowerCase();
		const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
		const videoExts = ["mp4", "avi", "mov"];

		if (ext && imageExts.includes(ext)) {
			await this.sock.sendMessage(chatId, {
				image: data,
				caption: fileName,
			});
		} else if (ext && videoExts.includes(ext)) {
			await this.sock.sendMessage(chatId, {
				video: data,
				caption: fileName,
			});
		} else {
			await this.sock.sendMessage(chatId, {
				document: data,
				mimetype: "application/octet-stream",
				fileName,
			});
		}
	}

	async sendTyping(chatId: string): Promise<void> {
		if (!this.sock) return;
		try {
			await this.sock.sendPresenceUpdate("composing", chatId);
		} catch {
			// Ignore typing indicator errors
		}
	}

	async sendAvailable(chatId: string): Promise<void> {
		if (!this.sock) return;
		try {
			await this.sock.sendPresenceUpdate("available", chatId);
		} catch {
			// Ignore presence errors
		}
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

	/**
	 * Enqueue an event for processing. Always queues.
	 * Returns true if enqueued, false if queue is full (max 5).
	 */
	enqueueEvent(event: WhatsAppEvent): boolean {
		const queue = this.getQueue(event.chatId);
		if (queue.size() >= 5) {
			log.logWarning(`Event queue full for ${event.chatId}, discarding: ${event.text.substring(0, 50)}`);
			return false;
		}
		log.logInfo(`Enqueueing event for ${event.chatId}: ${event.text.substring(0, 50)}`);
		queue.enqueue(() => this.handler.handleEvent(event, this, true));
		return true;
	}
}
