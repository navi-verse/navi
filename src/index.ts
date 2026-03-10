// index.ts — Main entry point

import {
	chat,
	getAuthStorage,
	getModelRegistry,
	initAgent,
	resetSession,
	setDefaultModelForProvider,
} from "./agent.js";
import { cancelOAuthInput, listProviders, performLogin, resolveOAuthInput, resolveProvider } from "./oauth.js";
import { connectWhatsApp } from "./whatsapp.js";

async function main() {
	console.log("╔══════════════════════════════════════╗");
	console.log("║   Navi WhatsApp Assistant            ║");
	console.log("╚══════════════════════════════════════╝\n");

	// Initialize the Navi agent (loads auth, model registry)
	initAgent();

	// Connect to WhatsApp and handle incoming messages
	const sock = await connectWhatsApp(async (jid, text, _msg) => {
		const trimmed = text.trim();

		// ── Check for pending OAuth input first ──────────────
		if (resolveOAuthInput(jid, trimmed)) {
			return; // Message was consumed by the OAuth flow
		}

		// ── Built-in commands ──────────────────────────────
		if (trimmed === "/reset") {
			await resetSession(jid);
			await sock.sendMessage(jid, { text: "🔄 Session reset. Fresh start!" });
			return;
		}

		if (trimmed === "/cancel") {
			cancelOAuthInput(jid);
			await sock.sendMessage(jid, { text: "Cancelled." });
			return;
		}

		if (trimmed === "/help") {
			await sock.sendMessage(jid, {
				text: [
					"🤖 *Navi*",
					"",
					"Just send me a message and I'll respond.",
					"",
					"/login        — Log in to an AI provider (OAuth)",
					"/login <n>    — Log in to provider by number",
					"/logout <id>  — Log out from a provider",
					"/providers    — List logged-in providers",
					"/model        — Show current model info",
					"/reset        — Start a fresh conversation",
					"/cancel       — Cancel pending login",
					"/help         — Show this message",
				].join("\n"),
			});
			return;
		}

		// ── /login [provider] ────────────────────────────────
		if (trimmed === "/login") {
			const msg = listProviders(getAuthStorage());
			await sock.sendMessage(jid, { text: msg });
			return;
		}

		if (trimmed.startsWith("/login ")) {
			const arg = trimmed.slice("/login ".length).trim();
			const providerId = resolveProvider(getAuthStorage(), arg);

			if (!providerId) {
				await sock.sendMessage(jid, {
					text: `Unknown provider "${arg}".\n\n${listProviders(getAuthStorage())}`,
				});
				return;
			}

			const provider = getAuthStorage()
				.getOAuthProviders()
				.find((p) => p.id === providerId);
			await sock.sendMessage(jid, {
				text: `Starting login for ${provider?.name ?? providerId}...`,
			});

			try {
				await performLogin(getAuthStorage(), providerId, {
					jid,
					sendMessage: async (text: string) => {
						await sock.sendMessage(jid, { text });
					},
				});

				const modelMsg = await setDefaultModelForProvider(providerId);
				await sock.sendMessage(jid, { text: `✅ ${modelMsg}` });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await sock.sendMessage(jid, { text: `❌ Login failed: ${msg}` });
			}
			return;
		}

		// ── /logout <provider> ───────────────────────────────
		if (trimmed.startsWith("/logout")) {
			const arg = trimmed.slice("/logout".length).trim();
			if (!arg) {
				await sock.sendMessage(jid, {
					text: "Usage: /logout <provider-id>\nSee /providers for logged-in providers.",
				});
				return;
			}

			const providerId = resolveProvider(getAuthStorage(), arg);
			if (!providerId) {
				await sock.sendMessage(jid, { text: `Unknown provider "${arg}".` });
				return;
			}

			getAuthStorage().logout(providerId);
			getModelRegistry().refresh();
			await sock.sendMessage(jid, { text: `Logged out from ${providerId}.` });
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
				text: ["*Provider Status:*", "", ...lines].join("\n"),
			});
			return;
		}

		// ── /model ───────────────────────────────────────────
		if (trimmed === "/model") {
			const available = getModelRegistry().getAvailable();
			if (available.length === 0) {
				await sock.sendMessage(jid, {
					text: "No models available. Use /login to authenticate with a provider.",
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
		// Show typing indicator while processing
		await sock.presenceSubscribe(jid);
		await sock.sendPresenceUpdate("composing", jid);

		const response = await chat(jid, text);

		await sock.sendPresenceUpdate("paused", jid);

		// WhatsApp has a ~65k char limit; split if needed
		const chunks = splitMessage(response, 4000);
		for (const chunk of chunks) {
			await sock.sendMessage(jid, { text: chunk });
		}
	});

	// Graceful shutdown
	process.on("SIGINT", () => {
		console.log("\n👋 Shutting down...");
		sock.end(undefined);
		process.exit(0);
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
