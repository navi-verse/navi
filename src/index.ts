// index.ts — Main entry point

import { chat, getAuthStorage, getModelRegistry, initAgent, resetSession } from "./agent.js";
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
					"/providers — Show login status",
					"/model     — List available models",
					"/reset     — Start a fresh conversation",
					"/help      — Show this message",
					"",
					"Log in via CLI: npm run login",
				].join("\n"),
			});
			return;
		}

		// ── /providers ───────────────────────────────────────
		if (trimmed === "/providers") {
			const authStorage = getAuthStorage();
			const providers = authStorage.getOAuthProviders();
			const lines = providers.map((p) => {
				const loggedIn = authStorage.has(p.id) ? "✅" : "—";
				return `${loggedIn} ${p.name} (${p.id})`;
			});
			await sock.sendMessage(jid, {
				text: ["*Provider Status:*", "", ...lines, "", "Log in via CLI: npm run login"].join("\n"),
			});
			return;
		}

		// ── /model ───────────────────────────────────────────
		if (trimmed === "/model") {
			const available = getModelRegistry().getAvailable();
			if (available.length === 0) {
				await sock.sendMessage(jid, {
					text: "No models available. Log in via CLI: npm run login",
				});
			} else {
				const lines = available.slice(0, 15).map((m) => `• ${m.name} (${m.provider}/${m.id})`);
				if (available.length > 15) {
					lines.push(`... and ${available.length - 15} more`);
				}
				await sock.sendMessage(jid, {
					text: ["*Available Models:*", "", ...lines].join("\n"),
				});
			}
			return;
		}

		// ── Send to Navi agent and reply ────────────────────
		await sock.presenceSubscribe(jid);
		await sock.sendPresenceUpdate("composing", jid);

		const response = await chat(jid, text);
		console.log(`🤖 ${jid}: ${response.substring(0, 80)}${response.length > 80 ? "..." : ""}`);

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
