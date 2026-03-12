// index.ts — Main entry point

import { chat, initAgent } from "./agent";
import { handleMessage } from "./channel";
import { getChatPaths, log, logError } from "./config";
import { startJobs } from "./jobs";
import { jobPrompt } from "./prompts";
import { startRoutines } from "./routines";
import { connectWhatsApp, getSocket, sendOutboxFiles, splitMessage } from "./whatsapp";

async function main() {
	log("╔══════════════════════════════════════╗");
	log("║   Navi Personal Assistant            ║");
	log("╚══════════════════════════════════════╝\n");

	initAgent();

	await connectWhatsApp(handleMessage);

	const deliver = async (contactId: string, response: string) => {
		// Strip reaction tags — not applicable for system-initiated messages
		const cleaned = response.replace(/\[react:.+?\]/g, "").trim();
		if (!cleaned || cleaned === "[skip]" || cleaned === "(no response)") {
			log(`⏭️ ${contactId}: skipped (${cleaned || "empty"})`);
			return;
		}
		const sock = getSocket();
		if (!sock) {
			log(`⚠️ ${contactId}: no socket`);
			return;
		}
		const chunks = splitMessage(cleaned, 4000);
		for (const chunk of chunks) {
			await sock.sendMessage(contactId, { text: chunk });
		}
		await sendOutboxFiles(sock, contactId, getChatPaths(contactId).outbox);
	};

	startJobs(async (contactId, message) => {
		const response = await chat(contactId, jobPrompt(message));
		log(`⏰ ${contactId}: job → ${response.substring(0, 100)}`);
		await deliver(contactId, response);
	});

	startRoutines(async (contactId, prompt) => {
		const response = await chat(contactId, prompt);
		log(`🔄 ${contactId}: routine → ${response.substring(0, 100)}`);
		await deliver(contactId, response);
	});
}

main().catch((err) => {
	logError("Fatal error:", err);
	process.exit(1);
});
