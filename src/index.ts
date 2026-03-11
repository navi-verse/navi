// index.ts — Main entry point

import { chat, initAgent } from "./agent";
import { handleMessage } from "./channel";
import { startCron } from "./cron";
import { connectWhatsApp, getSocket, splitMessage } from "./whatsapp";

async function main() {
	console.log("╔══════════════════════════════════════╗");
	console.log("║   Navi Personal Assistant            ║");
	console.log("╚══════════════════════════════════════╝\n");

	initAgent();

	await connectWhatsApp(handleMessage);

	startCron(async (contactId, message) => {
		const response = await chat(contactId, message);
		const sock = getSocket();
		if (!sock) return;
		const chunks = splitMessage(response, 4000);
		for (const chunk of chunks) {
			await sock.sendMessage(contactId, { text: chunk });
		}
	});
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
