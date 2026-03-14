import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelContext } from "./channel";

vi.mock("./agent", () => ({
	chat: vi.fn(async () => "Hello from Navi!"),
	abortSession: vi.fn(async () => true),
	resetSession: vi.fn(async () => {}),
	getAuthStorage: vi.fn(() => ({
		getOAuthProviders: () => [{ id: "anthropic", name: "Anthropic" }],
		has: (id: string) => id === "anthropic",
	})),
	getContextUsage: vi.fn(() => ({
		tokens: 5000,
		contextWindow: 200000,
		percent: 2.5,
	})),
}));

vi.mock("./config", async () => {
	const actual = await vi.importActual<typeof import("./config")>("./config");
	return {
		...actual,
		config: {
			model: "anthropic/claude-sonnet-4-6",
			thinkingLevel: "low",
			workspaceDir: "/tmp/navi-test",
		},
		log: vi.fn(),
		logError: vi.fn(),
	};
});

import { abortSession, chat, resetSession } from "./agent";
import { handleMessage } from "./channel";

function createMockCtx(): ChannelContext {
	return {
		respond: vi.fn(async () => {}),
		react: vi.fn(async () => {}),
		sendMedia: vi.fn(async () => {}),
		setTyping: vi.fn(async () => {}),
		stopTyping: vi.fn(async () => {}),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("handleMessage — commands", () => {
	it("/stop aborts session and responds", async () => {
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "/stop", ctx);

		expect(abortSession).toHaveBeenCalledWith("123@s.whatsapp.net");
		expect(ctx.respond).toHaveBeenCalledWith("⏹️ Stopped.");
		expect(chat).not.toHaveBeenCalled();
	});

	it("/stop reports nothing running when no session", async () => {
		vi.mocked(abortSession).mockResolvedValueOnce(false);
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "/stop", ctx);

		expect(ctx.respond).toHaveBeenCalledWith("Nothing running.");
	});

	it("/reset resets session and responds", async () => {
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "/reset", ctx);

		expect(resetSession).toHaveBeenCalledWith("123@s.whatsapp.net");
		expect(ctx.respond).toHaveBeenCalledWith("🔄 Session reset. Fresh start!");
		expect(chat).not.toHaveBeenCalled();
	});

	it("/help responds with help text", async () => {
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "/help", ctx);

		expect(ctx.respond).toHaveBeenCalledOnce();
		const text = vi.mocked(ctx.respond).mock.calls[0][0];
		expect(text).toContain("/stop");
		expect(text).toContain("/reset");
		expect(text).toContain("/status");
		expect(text).toContain("/help");
		expect(chat).not.toHaveBeenCalled();
	});

	it("/status responds with model and provider info", async () => {
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "/status", ctx);

		expect(ctx.respond).toHaveBeenCalledOnce();
		const text = vi.mocked(ctx.respond).mock.calls[0][0];
		expect(text).toContain("anthropic/claude-sonnet-4-6");
		expect(text).toContain("Anthropic");
		expect(text).toContain("5k");
		expect(chat).not.toHaveBeenCalled();
	});
});

describe("handleMessage — normal messages", () => {
	it("sets typing, calls chat, responds, stops typing", async () => {
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "Hi there", ctx);

		expect(ctx.setTyping).toHaveBeenCalled();
		expect(chat).toHaveBeenCalledWith("123@s.whatsapp.net", "Hi there", undefined, undefined);
		expect(ctx.respond).toHaveBeenCalledWith("Hello from Navi!");
		expect(ctx.stopTyping).toHaveBeenCalled();
	});

	it("extracts reaction from response", async () => {
		vi.mocked(chat).mockResolvedValueOnce("[react:👍] Great job!");
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "test", ctx);

		expect(ctx.react).toHaveBeenCalledWith("👍");
		expect(ctx.respond).toHaveBeenCalledWith("Great job!");
	});

	it("skips respond for [skip] response", async () => {
		vi.mocked(chat).mockResolvedValueOnce("[skip]");
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "test", ctx);

		expect(ctx.respond).not.toHaveBeenCalled();
		expect(ctx.stopTyping).toHaveBeenCalled();
	});

	it("skips respond for (no response)", async () => {
		vi.mocked(chat).mockResolvedValueOnce("(no response)");
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "test", ctx);

		expect(ctx.respond).not.toHaveBeenCalled();
	});

	it("skips respond for empty string", async () => {
		vi.mocked(chat).mockResolvedValueOnce("");
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "test", ctx);

		expect(ctx.respond).not.toHaveBeenCalled();
	});

	it("handles reaction-only response (no text after react)", async () => {
		vi.mocked(chat).mockResolvedValueOnce("[react:❤️]");
		const ctx = createMockCtx();
		await handleMessage("123@s.whatsapp.net", "test", ctx);

		expect(ctx.react).toHaveBeenCalledWith("❤️");
		expect(ctx.respond).not.toHaveBeenCalled();
	});
});
