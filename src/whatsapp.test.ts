import { describe, expect, it, vi } from "vitest";
import { extForMime, mimeForExt, splitMessage } from "./whatsapp";

describe("splitMessage", () => {
	it("returns single chunk for short text", () => {
		expect(splitMessage("hello", 100)).toEqual(["hello"]);
	});

	it("returns single chunk for text exactly at limit", () => {
		const text = "a".repeat(100);
		expect(splitMessage(text, 100)).toEqual([text]);
	});

	it("splits at newline near limit", () => {
		const text = "first line\nsecond line";
		const chunks = splitMessage(text, 15);
		expect(chunks[0]).toBe("first line");
		expect(chunks[1]).toBe("second line");
	});

	it("splits at space when no good newline", () => {
		const text = "word1 word2 word3 word4 word5";
		const chunks = splitMessage(text, 18);
		expect(chunks.length).toBeGreaterThan(1);
		// Each chunk should not exceed maxLen
		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(18);
		}
	});

	it("hard-splits when no whitespace", () => {
		const text = "a".repeat(30);
		const chunks = splitMessage(text, 10);
		expect(chunks[0]).toBe("a".repeat(10));
		expect(chunks.length).toBe(3);
	});

	it("returns empty array content for empty string", () => {
		expect(splitMessage("", 100)).toEqual([""]);
	});
});

describe("extForMime", () => {
	it("maps known MIME types", () => {
		expect(extForMime("image/jpeg")).toBe(".jpg");
		expect(extForMime("image/png")).toBe(".png");
		expect(extForMime("video/mp4")).toBe(".mp4");
		expect(extForMime("audio/ogg; codecs=opus")).toBe(".ogg");
		expect(extForMime("application/pdf")).toBe(".pdf");
	});

	it("falls back to mime suffix for unknown types", () => {
		expect(extForMime("application/xml")).toBe(".xml");
		expect(extForMime("text/csv")).toBe(".csv");
	});
});

describe("mimeForExt", () => {
	it("maps known extensions", () => {
		expect(mimeForExt("photo.jpg")).toBe("image/jpeg");
		expect(mimeForExt("photo.jpeg")).toBe("image/jpeg");
		expect(mimeForExt("video.mp4")).toBe("video/mp4");
		expect(mimeForExt("voice.ogg")).toBe("audio/ogg; codecs=opus");
		expect(mimeForExt("doc.pdf")).toBe("application/pdf");
	});

	it("is case-insensitive", () => {
		expect(mimeForExt("photo.JPG")).toBe("image/jpeg");
		expect(mimeForExt("video.MP4")).toBe("video/mp4");
	});

	it("falls back to application/octet-stream for unknown", () => {
		expect(mimeForExt("file.xyz")).toBe("application/octet-stream");
	});
});

// Mirrors the dispatch logic in createSendMediaTool.execute()
function classifyMedia(ext: string, gifParam?: boolean, voiceNoteParam?: boolean) {
	const isGif = gifParam ?? ext === ".gif";
	if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext) && !isGif) return "image";
	if ([".mp4", ".mkv", ".avi", ".gif"].includes(ext) || isGif) return { type: "video", gifPlayback: isGif };
	if ([".ogg", ".mp3", ".m4a", ".wav"].includes(ext)) return { type: "audio", ptt: voiceNoteParam ?? ext === ".ogg" };
	return "document";
}

describe("send_media dispatch", () => {
	it("dispatches image extensions as image", () => {
		expect(classifyMedia(".jpg")).toBe("image");
		expect(classifyMedia(".jpeg")).toBe("image");
		expect(classifyMedia(".png")).toBe("image");
		expect(classifyMedia(".webp")).toBe("image");
	});

	it("dispatches video extensions as video", () => {
		expect(classifyMedia(".mp4")).toEqual({ type: "video", gifPlayback: false });
		expect(classifyMedia(".mkv")).toEqual({ type: "video", gifPlayback: false });
		expect(classifyMedia(".avi")).toEqual({ type: "video", gifPlayback: false });
	});

	it("dispatches .gif as video with gifPlayback", () => {
		expect(classifyMedia(".gif")).toEqual({ type: "video", gifPlayback: true });
	});

	it("dispatches audio extensions as audio", () => {
		expect(classifyMedia(".mp3")).toEqual({ type: "audio", ptt: false });
		expect(classifyMedia(".m4a")).toEqual({ type: "audio", ptt: false });
		expect(classifyMedia(".wav")).toEqual({ type: "audio", ptt: false });
	});

	it("ogg defaults to voice note (ptt)", () => {
		expect(classifyMedia(".ogg")).toEqual({ type: "audio", ptt: true });
	});

	it("voiceNote param overrides ptt default", () => {
		expect(classifyMedia(".ogg", undefined, false)).toEqual({ type: "audio", ptt: false });
		expect(classifyMedia(".mp3", undefined, true)).toEqual({ type: "audio", ptt: true });
	});

	it("gif param forces video+gifPlayback for non-gif extensions", () => {
		expect(classifyMedia(".png", true)).toEqual({ type: "video", gifPlayback: true });
	});

	it("unknown extensions fall through to document", () => {
		expect(classifyMedia(".pdf")).toBe("document");
		expect(classifyMedia(".zip")).toBe("document");
		expect(classifyMedia(".docx")).toBe("document");
	});
});
