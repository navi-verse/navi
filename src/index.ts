// index.ts — Main entry point

import { chat, getAuthStorage, initAgent, resetSession } from "./agent.js";
import { config } from "./config.js";
import { connectWhatsApp } from "./whatsapp.js";

async function main() {
	console.log("╔══════════════════════════════════════╗");
	console.log("║   Navi WhatsApp Assistant            ║");
	console.log("╚══════════════════════════════════════╝\n");

	// Initialize the Navi agent (loads auth, model registry)
	initAgent();

	// Connect to WhatsApp and handle incoming messages
	await connectWhatsApp(async (sock, jid, text, _msg) => {
		const trimmed = text.trim();

		// ── Built-in commands ──────────────────────────────
		if (trimmed === "/reset") {
			await resetSession(jid);
			await sock.sendMessage(jid, { text: "🔄 Session reset. Fresh start!" });
			return;
		}

		if (trimmed === "/help") {
			await sock.sendMessage(jid, {
				text: [
					"🤖 *Navi*",
					"",
					"Just send me a message and I'll respond.",
					"",
					"/status — Show model & provider info",
					"/reset  — Start a fresh conversation",
					"/help   — Show this message",
					"",
					"Log in via CLI: npm run login",
				].join("\n"),
			});
			return;
		}

		// ── /status ──────────────────────────────────────────
		if (trimmed === "/status") {
			const authStorage = getAuthStorage();
			const providers = authStorage.getOAuthProviders();
			const loggedIn = providers.filter((p) => authStorage.has(p.id));
			const providerList = loggedIn.map((p) => p.name).join(", ") || "none";

			await sock.sendMessage(jid, {
				text: [
					"🤖 *Navi Status*",
					"",
					`🧠 *Model:* ${config.model || "auto"}`,
					`💭 *Thinking:* ${config.thinkingLevel || "off"}`,
					`🔌 *Providers:* ${providerList}`,
					"",
					"Log in via CLI: npm run login",
				].join("\n"),
			});
			return;
		}

		// ── Send to Navi agent and reply ────────────────────
		await sock.presenceSubscribe(jid);
		await sock.sendPresenceUpdate("composing", jid);

		const start = Date.now();
		const response = await chat(jid, text);
		const duration = ((Date.now() - start) / 1000).toFixed(1);
		console.log(`🤖 ${jid} (${duration}s): ${response.substring(0, 80)}${response.length > 80 ? "..." : ""}`);

		await sock.sendPresenceUpdate("paused", jid);

		// WhatsApp has a ~65k char limit; split if needed
		const chunks = splitMessage(response, 4000);
		for (const chunk of chunks) {
			await sock.sendMessage(jid, { text: chunk });
		}
	});
}

/** Split long messages into WhatsApp-friendly chunks */
function splitMessage(text: string, maxLen: number): string[] {
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
			// No good newline break — split at last space
			splitAt = remaining.lastIndexOf(" ", maxLen);
		}
		if (splitAt < maxLen * 0.3) {
			// No good break at all — hard split
			splitAt = maxLen;
		}

		chunks.push(remaining.substring(0, splitAt));
		remaining = remaining.substring(splitAt).trimStart();
	}

	return chunks;
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
