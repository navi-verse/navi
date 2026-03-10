// index.ts — Main entry point

import { initAgent } from "./agent.js";
import { handleMessage } from "./channel.js";
import { connectWhatsApp } from "./whatsapp.js";

async function main() {
	console.log("╔══════════════════════════════════════╗");
	console.log("║   Navi WhatsApp Assistant            ║");
	console.log("╚══════════════════════════════════════╝\n");

	initAgent();

	await connectWhatsApp(handleMessage);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
