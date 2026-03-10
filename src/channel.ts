// channel.ts — Channel abstraction and shared message handling

import { abortSession, chat, getAuthStorage, resetSession } from "./agent.js";
import { config } from "./config.js";

export interface ChannelContext {
	respond(text: string): Promise<void>;
	setTyping(): Promise<void>;
	stopTyping(): Promise<void>;
}

export async function handleMessage(contactId: string, text: string, ctx: ChannelContext): Promise<void> {
	const trimmed = text.trim();

	// ── Built-in commands ──────────────────────────────
	if (trimmed === "/stop") {
		const stopped = await abortSession(contactId);
		await ctx.respond(stopped ? "⏹️ Stopped." : "Nothing running.");
		return;
	}

	if (trimmed === "/reset") {
		await resetSession(contactId);
		await ctx.respond("🔄 Session reset. Fresh start!");
		return;
	}

	if (trimmed === "/help") {
		await ctx.respond(
			[
				"🤖 *Navi*",
				"",
				"Just send me a message and I'll respond.",
				"",
				"/stop   — Stop the current response",
				"/status — Show model & provider info",
				"/reset  — Start a fresh conversation",
				"/help   — Show this message",
				"",
				"Log in via CLI: npm run login",
			].join("\n"),
		);
		return;
	}

	if (trimmed === "/status") {
		const authStorage = getAuthStorage();
		const providers = authStorage.getOAuthProviders();
		const loggedIn = providers.filter((p) => authStorage.has(p.id));
		const providerList = loggedIn.map((p) => p.name).join(", ") || "none";

		await ctx.respond(
			[
				"🤖 *Navi Status*",
				"",
				`🧠 *Model:* ${config.model || "auto"}`,
				`💭 *Thinking:* ${config.thinkingLevel || "off"}`,
				`🔌 *Providers:* ${providerList}`,
				"",
				"Log in via CLI: npm run login",
			].join("\n"),
		);
		return;
	}

	// ── Send to agent and reply ────────────────────────
	await ctx.setTyping();

	const start = Date.now();
	const response = await chat(contactId, text);
	const duration = ((Date.now() - start) / 1000).toFixed(1);
	const logPreview = response.replace(/\n/g, " ").substring(0, 80);
	console.log(`🤖 ${contactId} (${duration}s): ${logPreview}${response.length > 80 ? "..." : ""}`);

	await ctx.stopTyping();
	await ctx.respond(response);
}
