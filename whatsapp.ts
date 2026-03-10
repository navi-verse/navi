// whatsapp.ts — Baileys WhatsApp connection

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { mkdirSync } from "fs";
import { config } from "./config.js";

export type MessageHandler = (
  jid: string,
  text: string,
  message: proto.IWebMessageInfo
) => Promise<void>;

const logger = pino({ level: "warn" });

export async function connectWhatsApp(
  onMessage: MessageHandler
): Promise<WASocket> {
  mkdirSync(config.baileysAuthDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(
    config.baileysAuthDir
  );

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: Browsers.ubuntu("Pi Assistant"),
  });

  // Save credentials whenever they update
  sock.ev.on("creds.update", saveCreds);

  // Handle connection lifecycle
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan the QR code above with WhatsApp\n");
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        console.error("❌ Logged out. Delete", config.baileysAuthDir, "and restart.");
        process.exit(1);
      }

      // Reconnect on any other disconnect
      console.log("🔄 Reconnecting...");
      setTimeout(() => connectWhatsApp(onMessage), 3000);
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected!");
    }
  });

  // Handle incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip messages sent by us
      if (msg.key.fromMe) continue;

      // Extract text content
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      if (!text.trim()) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // Check allowlist
      if (config.allowedJids.length > 0 && !config.allowedJids.includes(jid)) {
        console.log(`⛔ Blocked message from ${jid}`);
        continue;
      }

      console.log(`📩 ${jid}: ${text.substring(0, 80)}${text.length > 80 ? "..." : ""}`);

      try {
        await onMessage(jid, text, msg);
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
