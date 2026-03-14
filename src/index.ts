// index.ts — Main entry point

import { execSync } from "node:child_process";
import { chat, initAgent } from "./agent";
import { handleMessage } from "./channel";
import { log, logError } from "./config";
import { startJobs } from "./jobs";
import { cleanupMedia } from "./media";
import { jobPrompt } from "./prompts";
import { startRoutines } from "./routines";
import { connectWhatsApp, getSocket, splitMessage } from "./whatsapp";

async function main() {
	const version = (() => {
		try {
			return execSync("git describe --tags --long 2>/dev/null", { encoding: "utf-8" }).trim();
		} catch {
			return "unknown";
		}
	})();
	log(`🚀 Navi ${version}`);

	initAgent();
	cleanupMedia();

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
	};

	startJobs(async (contactId, message) => {
		const response = await chat(contactId, jobPrompt(message));
		log(`⏰ ${contactId}: job → ${response.substring(0, 100)}`, { contactId });
		await deliver(contactId, response);
	});

	startRoutines(async (contactId, prompt) => {
		const response = await chat(contactId, prompt);
		log(`🔄 ${contactId}: routine → ${response.substring(0, 100)}`, { contactId });
		await deliver(contactId, response);
	});
}

main().catch((err) => {
	logError("Fatal error:", err);
	process.exit(1);
});
