import { describe, expect, it } from "vitest";
import { checkMediaSize, formatSize, isExpired } from "./media";

describe("checkMediaSize", () => {
	it("accepts files within the default limit", () => {
		expect(checkMediaSize(10 * 1024 * 1024)).toBe(true);
	});

	it("accepts files exactly at the limit", () => {
		expect(checkMediaSize(50 * 1024 * 1024)).toBe(true);
	});

	it("rejects files over the default limit", () => {
		expect(checkMediaSize(51 * 1024 * 1024)).toBe(false);
	});

	it("accepts zero-byte files", () => {
		expect(checkMediaSize(0)).toBe(true);
	});
});

describe("formatSize", () => {
	it("formats bytes", () => {
		expect(formatSize(500)).toBe("500 B");
	});

	it("formats kilobytes", () => {
		expect(formatSize(2048)).toBe("2 KB");
	});

	it("formats megabytes", () => {
		expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
	});

	it("formats fractional megabytes", () => {
		expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
	});
});

describe("isExpired", () => {
	const now = Date.now();
	const oneDay = 24 * 60 * 60 * 1000;

	it("returns false for recent files", () => {
		expect(isExpired(now - oneDay, now, 30)).toBe(false);
	});

	it("returns false for files exactly at retention", () => {
		expect(isExpired(now - 30 * oneDay, now, 30)).toBe(false);
	});

	it("returns true for files older than retention", () => {
		expect(isExpired(now - 31 * oneDay, now, 30)).toBe(true);
	});

	it("works with custom retention period", () => {
		expect(isExpired(now - 8 * oneDay, now, 7)).toBe(true);
		expect(isExpired(now - 6 * oneDay, now, 7)).toBe(false);
	});
});
