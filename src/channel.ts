// channel.ts — Channel abstraction and shared message handling

import { abortSession, chat, getAuthStorage, getContextUsage, resetSession } from "./agent";
import { config, log } from "./config";

export interface ImageAttachment {
	type: "image";
	data: string;
	mimeType: string;
}

export interface ChannelContext {
	respond(text: string): Promise<void>;
	react(emoji: string): Promise<void>;
	sendMedia(filePath: string, options?: { caption?: string; mimeType?: string }): Promise<void>;
	setTyping(): Promise<void>;
	stopTyping(): Promise<void>;
}

export async function handleMessage(
	contactId: string,
	text: string,
	ctx: ChannelContext,
	images?: ImageAttachment[],
	contactName?: string,
): Promise<void> {
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

		const ctx_ = getContextUsage(contactId);
		const ctxLine = ctx_
			? `📊 *Context:* ${ctx_.tokens != null ? `${Math.round(ctx_.tokens / 1000)}k` : "?"} / ${Math.round(ctx_.contextWindow / 1000)}k tokens (${ctx_.percent != null ? `${Math.round(ctx_.percent)}%` : "?"})`
			: "📊 *Context:* no active session";

		await ctx.respond(
			[
				"🤖 *Navi Status*",
				"",
				`🧠 *Model:* ${config.model || "auto"}`,
				`💭 *Thinking:* ${config.thinkingLevel || "off"}`,
				`🔌 *Providers:* ${providerList}`,
				ctxLine,
				"",
				"Log in via CLI: npm run login",
			].join("\n"),
		);
		return;
	}

	// ── Send to agent and reply ────────────────────────
	await ctx.setTyping();

	const start = Date.now();
	let response = await chat(contactId, text, images, contactName);
	const duration = ((Date.now() - start) / 1000).toFixed(1);

	// Extract reaction if present (e.g. "[react:👍]")
	const reactMatch = response.match(/\[react:(.+?)\]/);
	if (reactMatch) {
		response = response.replace(reactMatch[0], "").trim();
		await ctx.react(reactMatch[1]);
	}

	if (!response || response === "[skip]" || response === "(no response)") {
		log(`⏭️ ${contactId} (${duration}s): ${reactMatch ? reactMatch[1] : "skipped"}`, {
			contactId,
			duration: Number(duration),
		});
		await ctx.stopTyping();
		return;
	}

	const logPreview = response.replace(/\n/g, " ").substring(0, 80);
	log(`🤖 ${contactId} (${duration}s): ${logPreview}${response.length > 80 ? "..." : ""}`, {
		contactId,
		duration: Number(duration),
	});

	await ctx.stopTyping();
	await ctx.respond(response);
}
