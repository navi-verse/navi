// whatsapp.ts — Baileys WhatsApp connection

import { mkdirSync } from "node:fs";
import makeWASocket, {
	Browsers,
	DisconnectReason,
	type proto,
	useMultiFileAuthState,
	type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
// @ts-expect-error no types available
import qrcode from "qrcode-terminal";
import { config } from "./config.js";

export type MessageHandler = (
	sock: WASocket,
	jid: string,
	text: string,
	message: proto.IWebMessageInfo,
) => Promise<void>;

const logger = pino({ level: "warn" });

export async function connectWhatsApp(onMessage: MessageHandler): Promise<WASocket> {
	mkdirSync(config.baileysAuthDir, { recursive: true });

	const { state, saveCreds } = await useMultiFileAuthState(config.baileysAuthDir);

	const sock = makeWASocket({
		auth: state,
		logger,
		browser: Browsers.ubuntu("Navi"),
	});

	sock.ev.on("creds.update", saveCreds);

	sock.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (qr) {
			qrcode.generate(qr, { small: true }, (code: string) => {
				console.log(`\n${code}`);
				console.log("📱 Scan the QR code above with WhatsApp\n");
			});
		}

		if (connection === "close") {
			const error = lastDisconnect?.error as { output?: { statusCode?: number } };
			const shouldReconnect = error?.output?.statusCode !== DisconnectReason.loggedOut;

			if (shouldReconnect) {
				console.log("🔄 Reconnecting...");
				connectWhatsApp(onMessage);
			} else {
				console.error("❌ Logged out. Delete", config.baileysAuthDir, "and restart.");
				process.exit(1);
			}
		}

		if (connection === "open") {
			console.log("✅ WhatsApp connected!");
		}
	});

	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify") return;

		for (const msg of messages) {
			if (msg.key.fromMe) continue;

			const text =
				msg.message?.conversation ||
				msg.message?.extendedTextMessage?.text ||
				msg.message?.imageMessage?.caption ||
				msg.message?.videoMessage?.caption ||
				"";

			if (!text.trim()) continue;

			const jid = msg.key.remoteJid;
			if (!jid) continue;

			if (config.allowedJids.length > 0 && !config.allowedJids.includes(jid)) {
				console.log(`⛔ Blocked message from ${jid}`);
				continue;
			}

			console.log(`📩 ${jid}: ${text.substring(0, 80)}${text.length > 80 ? "..." : ""}`);

			try {
				await onMessage(sock, jid, text, msg);
			} catch (err) {
				console.error(`Error handling message from ${jid}:`, err);
				await sock.sendMessage(jid, {
					text: "⚠️ Something went wrong processing your message. Try again.",
				});
			}
		}
	});

	return sock;
}
