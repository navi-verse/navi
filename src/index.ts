// index.ts — Main entry point

import { initAgent } from "./agent";
import { handleMessage } from "./channel";
import { connectWhatsApp } from "./whatsapp";

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
