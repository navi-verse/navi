// whatsapp.ts — Baileys WhatsApp transport

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import makeWASocket, {
	Browsers,
	DisconnectReason,
	downloadMediaMessage,
	useMultiFileAuthState,
	type WAMessage,
	type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
// @ts-expect-error no types available
import qrcode from "qrcode-terminal";
import type { ChannelContext, ImageAttachment } from "./channel";
import { config, getChatPaths, log, logError } from "./config";
import { transcribe } from "./stt";

export type MessageHandler = (
	contactId: string,
	text: string,
	ctx: ChannelContext,
	images?: ImageAttachment[],
	contactName?: string,
) => Promise<void>;

const logger = pino({ level: "error" });

const socketRef: { current: WASocket | null } = { current: null };

export function getSocket(): WASocket | null {
	return socketRef.current;
}

// libsignal spams console.info with "Closing session:" dumps — suppress them
const _origInfo = console.info;
console.info = (...args: unknown[]) => {
	if (typeof args[0] === "string" && args[0].startsWith("Closing session")) return;
	_origInfo(...args);
};

const MIME_TO_EXT: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp",
	"image/gif": ".gif",
	"video/mp4": ".mp4",
	"audio/ogg; codecs=opus": ".ogg",
	"audio/mpeg": ".mp3",
	"audio/mp4": ".m4a",
	"application/pdf": ".pdf",
};

const EXT_TO_MIME: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".mp4": "video/mp4",
	".mkv": "video/x-matroska",
	".avi": "video/x-msvideo",
	".ogg": "audio/ogg; codecs=opus",
	".mp3": "audio/mp4",
	".m4a": "audio/mp4",
	".wav": "audio/wav",
	".pdf": "application/pdf",
	".doc": "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".zip": "application/zip",
};

export function extForMime(mime: string): string {
	return MIME_TO_EXT[mime] || `.${mime.split("/").pop() || "bin"}`;
}

export function mimeForExt(filePath: string): string {
	return EXT_TO_MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function timestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

interface ExtractedMedia {
	text: string;
	images: ImageAttachment[];
}

async function extractMedia(msg: WAMessage, mediaDir: string): Promise<ExtractedMedia> {
	const m = msg.message;
	if (!m) return { text: "", images: [] };

	const text =
		m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";
	const images: ImageAttachment[] = [];

	mkdirSync(mediaDir, { recursive: true });

	const descriptions: string[] = [];

	// Image
	if (m.imageMessage) {
		try {
			const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
			const mime = m.imageMessage.mimetype || "image/jpeg";
			const filePath = join(mediaDir, `image_${timestamp()}${extForMime(mime)}`);
			writeFileSync(filePath, buffer);
			const sizeKb = Math.round(buffer.length / 1024);
			images.push({ type: "image", data: buffer.toString("base64"), mimeType: mime });
			descriptions.push(`[Image saved: ${filePath} (${sizeKb} KB)]`);
			log(`📸 image: ${filePath}`);
		} catch (err) {
			logError("Failed to download image:", err);
		}
	}

	// Sticker (treat as image)
	if (m.stickerMessage) {
		try {
			const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
			const mime = m.stickerMessage.mimetype || "image/webp";
			const filePath = join(mediaDir, `sticker_${timestamp()}${extForMime(mime)}`);
			writeFileSync(filePath, buffer);
			const sizeKb = Math.round(buffer.length / 1024);
			images.push({ type: "image", data: buffer.toString("base64"), mimeType: mime });
			descriptions.push(`[Sticker saved: ${filePath} (${sizeKb} KB)]`);
			log(`🎨 sticker: ${filePath}`);
		} catch (err) {
			logError("Failed to download sticker:", err);
		}
	}

	// Video / GIF — save to disk, describe in text
	if (m.videoMessage) {
		try {
			const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
			const isGif = m.videoMessage.gifPlayback;
			const mime = m.videoMessage.mimetype || "video/mp4";
			const prefix = isGif ? "gif" : "video";
			const filePath = join(mediaDir, `${prefix}_${timestamp()}${extForMime(mime)}`);
			writeFileSync(filePath, buffer);
			const label = isGif ? "GIF" : "Video";
			const sizeKb = Math.round(buffer.length / 1024);
			const desc = `[${label} received: ${filePath} (${sizeKb} KB)]`;
			log(`🎬 ${label.toLowerCase()}: ${filePath}`);
			return { text: text ? `${desc}\n${text}` : desc, images };
		} catch (err) {
			logError("Failed to download video:", err);
		}
	}

	// Audio / voice note — save to disk, transcribe, describe in text
	if (m.audioMessage) {
		try {
			const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
			const mime = m.audioMessage.mimetype || "audio/ogg; codecs=opus";
			const isVoice = m.audioMessage.ptt;
			const prefix = isVoice ? "voice" : "audio";
			const filePath = join(mediaDir, `${prefix}_${timestamp()}${extForMime(mime)}`);
			writeFileSync(filePath, buffer);
			const label = isVoice ? "Voice note" : "Audio";
			const sizeKb = Math.round(buffer.length / 1024);

			const transcript = await transcribe(filePath);
			const parts = [`[${label}: ${filePath} (${sizeKb} KB)]`];
			if (transcript) {
				parts.push(`[Transcription: ${transcript}]`);
				log(`🎤 ${label.toLowerCase()}: ${transcript.substring(0, 80)}`);
			}
			log(`🎵 ${label.toLowerCase()}: ${filePath}`);

			const desc = parts.join("\n");
			return { text: text ? `${desc}\n${text}` : desc, images };
		} catch (err) {
			logError("Failed to download audio:", err);
		}
	}

	// Document — save to disk, describe in text
	if (m.documentMessage) {
		try {
			const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
			const mime = m.documentMessage.mimetype || "application/octet-stream";
			const originalName = m.documentMessage.fileName || `document_${timestamp()}${extForMime(mime)}`;
			const filePath = join(mediaDir, `${timestamp()}_${originalName}`);
			writeFileSync(filePath, buffer);
			const sizeKb = Math.round(buffer.length / 1024);
			const desc = `[Document received: ${filePath} (${sizeKb} KB, ${mime})]`;
			log(`📄 document: ${filePath}`);
			return { text: text ? `${desc}\n${text}` : desc, images };
		} catch (err) {
			logError("Failed to download document:", err);
		}
	}

	const fullText = [...descriptions, text].filter(Boolean).join("\n");
	return { text: fullText, images };
}

// ── send_media tool ──────────────────────────────────

const sendMediaParams = Type.Object({
	path: Type.String({ description: "Absolute path to the file to send" }),
	caption: Type.Optional(Type.String({ description: "Caption for images/videos/documents" })),
	voiceNote: Type.Optional(Type.Boolean({ description: "Send audio as a voice note (default: true for .ogg)" })),
	gif: Type.Optional(Type.Boolean({ description: "Send video as a looping GIF (default: true for .gif)" })),
});

type SendMediaParams = Static<typeof sendMediaParams>;

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

export function createSendMediaTool(contactId: string): ToolDefinition {
	return {
		name: "send_media",
		label: "Send Media",
		description:
			"Send a file (image, video, audio, document) to the current chat. Supports jpg/png/webp/gif, mp4, ogg/mp3/m4a/wav, pdf, and more.",
		promptSnippet: "send_media — send a file (image, audio, video, document) to the chat",
		parameters: sendMediaParams,
		async execute(_toolCallId, params: SendMediaParams) {
			const sock = getSocket();
			if (!sock) return textResult("Error: WhatsApp not connected");

			const filePath = params.path;
			if (!existsSync(filePath)) return textResult(`Error: File not found: ${filePath}`);

			try {
				const buffer = readFileSync(filePath);
				const ext = extname(filePath).toLowerCase();
				const mime = mimeForExt(filePath);

				const isGif = params.gif ?? ext === ".gif";

				if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext) && !isGif) {
					await sock.sendMessage(contactId, { image: buffer, caption: params.caption });
				} else if ([".mp4", ".mkv", ".avi", ".gif"].includes(ext) || isGif) {
					await sock.sendMessage(contactId, {
						video: buffer,
						gifPlayback: isGif,
						caption: params.caption,
					});
				} else if ([".ogg", ".mp3", ".m4a", ".wav"].includes(ext)) {
					const ptt = params.voiceNote ?? ext === ".ogg";
					await sock.sendMessage(contactId, { audio: buffer, mimetype: mime, ptt });
				} else {
					await sock.sendMessage(contactId, {
						document: buffer,
						mimetype: mime,
						fileName: basename(filePath),
						caption: params.caption,
					});
				}

				log(`📤 ${contactId}: sent ${basename(filePath)}`);
				return textResult(`Sent: ${basename(filePath)}`);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				logError(`📤 ${contactId}: send_media error`, err);
				return textResult(`Error sending file: ${msg}`);
			}
		},
	};
}

export async function connectWhatsApp(onMessage: MessageHandler): Promise<WASocket> {
	mkdirSync(config.baileysAuthDir, { recursive: true });

	const { state, saveCreds } = await useMultiFileAuthState(config.baileysAuthDir);

	const sock = makeWASocket({
		auth: state,
		logger,
		browser: Browsers.ubuntu("Navi"),
	});
	socketRef.current = sock;

	sock.ev.on("creds.update", saveCreds);

	sock.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (qr) {
			qrcode.generate(qr, { small: true }, (code: string) => {
				console.log(`\n${code}`);
				log("📱 Scan the QR code above with WhatsApp\n");
			});
		}

		if (connection === "close") {
			const error = lastDisconnect?.error as { output?: { statusCode?: number } };
			const shouldReconnect = error?.output?.statusCode !== DisconnectReason.loggedOut;

			if (shouldReconnect) {
				log("🔄 WhatsApp: reconnecting");
				connectWhatsApp(onMessage);
			} else {
				logError("❌ WhatsApp: logged out, delete", config.baileysAuthDir, "and restart");
				process.exit(1);
			}
		}

		if (connection === "open") {
			log("✅ WhatsApp: connected");
		}
	});

	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify") return;

		for (const msg of messages) {
			if (msg.key.fromMe) continue;

			const jid = msg.key.remoteJid;
			if (!jid) continue;

			if (config.allowedJids.length > 0 && !config.allowedJids.includes(jid)) {
				log(`⛔ ${jid}: blocked`, { contactId: jid });
				continue;
			}

			// Mark as read immediately — before any processing
			try {
				await sock.readMessages([msg.key]);
			} catch (err) {
				logError(`👁️ ${jid}: read receipt failed`, err);
			}

			const chatPaths = getChatPaths(jid);
			const { text, images } = await extractMedia(msg, chatPaths.media);

			if (!text.trim() && images.length === 0) continue;

			// In group chats, prepend sender info so the agent knows who's writing
			let messageText = text;
			if (jid.endsWith("@g.us") && msg.key.participant) {
				const name = msg.pushName || msg.key.participant.split("@")[0];
				messageText = `[${name}]: ${text}`;
			}

			const logText = messageText || `[${images.length} image(s)]`;
			log(`📩 ${jid}: ${logText.substring(0, 80)}${logText.length > 80 ? "..." : ""}`, { contactId: jid });

			const ctx: ChannelContext = {
				async respond(response: string) {
					const chunks = splitMessage(response, 4000);
					for (const chunk of chunks) {
						await sock.sendMessage(jid, { text: chunk });
					}
				},
				async react(emoji: string) {
					await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
				},
				async sendMedia(filePath: string, options?: { caption?: string; mimeType?: string }) {
					const buffer = readFileSync(filePath);
					const ext = extname(filePath).toLowerCase();
					const mime = options?.mimeType || mimeForExt(filePath);

					if (ext === ".gif") {
						await sock.sendMessage(jid, { video: buffer, gifPlayback: true, caption: options?.caption });
					} else if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
						await sock.sendMessage(jid, { image: buffer, caption: options?.caption });
					} else if ([".mp4", ".mkv", ".avi"].includes(ext)) {
						await sock.sendMessage(jid, { video: buffer, caption: options?.caption });
					} else if ([".ogg", ".mp3", ".m4a", ".wav"].includes(ext)) {
						await sock.sendMessage(jid, { audio: buffer, mimetype: mime });
					} else {
						await sock.sendMessage(jid, {
							document: buffer,
							mimetype: mime,
							fileName: basename(filePath),
							caption: options?.caption,
						});
					}
				},
				async setTyping() {
					await sock.presenceSubscribe(jid);
					await sock.sendPresenceUpdate("composing", jid);
				},
				async stopTyping() {
					await sock.sendPresenceUpdate("paused", jid);
				},
			};

			try {
				const promptText = messageText || (images.length ? "What is this?" : "");
				await onMessage(jid, promptText, ctx, images.length ? images : undefined, msg.pushName || undefined);
			} catch (err) {
				logError(`❌ ${jid}: message handler error`, { contactId: jid, err: String(err) });
				await ctx.respond("⚠️ Something went wrong processing your message. Try again.");
			}
		}
	});

	return sock;
}

/** Split long messages into WhatsApp-friendly chunks */
export function splitMessage(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		if (remaining.length <= maxLen) {
			chunks.push(remaining);
			break;
		}

		// Try to split at a newline near the limit
		let splitAt = remaining.lastIndexOf("\n", maxLen);
		if (splitAt < maxLen * 0.5) {
			splitAt = remaining.lastIndexOf(" ", maxLen);
		}
		if (splitAt < maxLen * 0.3) {
			splitAt = maxLen;
		}

		chunks.push(remaining.substring(0, splitAt));
		remaining = remaining.substring(splitAt).trimStart();
	}

	return chunks;
}
