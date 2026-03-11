// index.ts — Main entry point

import { chat, initAgent } from "./agent";
import { handleMessage } from "./channel";
import { getChatPaths } from "./config";
import { startCron } from "./cron";
import { startHeartbeat } from "./heartbeat";
import { cronPrompt } from "./prompts";
import { connectWhatsApp, getSocket, sendOutboxFiles, splitMessage } from "./whatsapp";

async function main() {
	console.log("╔══════════════════════════════════════╗");
	console.log("║   Navi Personal Assistant            ║");
	console.log("╚══════════════════════════════════════╝\n");

	initAgent();

	await connectWhatsApp(handleMessage);

	const deliver = async (contactId: string, response: string) => {
		// Strip reaction tags — not applicable for system-initiated messages
		const cleaned = response.replace(/\[react:.+?\]/g, "").trim();
		if (!cleaned || cleaned === "[skip]" || cleaned === "(no response)") {
			console.log(`⏭️ ${contactId}: skipped (${cleaned || "empty"})`);
			return;
		}
		const sock = getSocket();
		if (!sock) {
			console.log(`⚠️ ${contactId}: no socket`);
			return;
		}
		const chunks = splitMessage(cleaned, 4000);
		for (const chunk of chunks) {
			await sock.sendMessage(contactId, { text: chunk });
		}
		await sendOutboxFiles(sock, contactId, getChatPaths(contactId).outbox);
	};

	startCron(async (contactId, message) => {
		const response = await chat(contactId, cronPrompt(message));
		console.log(`⏰ ${contactId}: cron → ${response.substring(0, 100)}`);
		await deliver(contactId, response);
	});

	startHeartbeat(async (contactId, prompt) => {
		const response = await chat(contactId, prompt);
		console.log(`💓 ${contactId}: heartbeat → ${response.substring(0, 100)}`);
		await deliver(contactId, response);
	});
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
