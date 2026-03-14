import { describe, expect, it } from "vitest";
import { formatJob, getNextFireTime, type Job } from "./jobs";

describe("getNextFireTime", () => {
	it("returns date for future at job", () => {
		const future = new Date(Date.now() + 60_000).toISOString();
		const job: Job = { id: "a", type: "at", message: "test", datetime: future, createdAt: new Date().toISOString() };
		const next = getNextFireTime(job);
		expect(next).toBeInstanceOf(Date);
		expect(next!.getTime()).toBeGreaterThan(Date.now());
	});

	it("returns null for past at job", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		const job: Job = { id: "b", type: "at", message: "test", datetime: past, createdAt: new Date().toISOString() };
		expect(getNextFireTime(job)).toBeNull();
	});

	it("calculates next fire for every job", () => {
		const created = new Date(Date.now() - 5000);
		const job: Job = {
			id: "c",
			type: "every",
			message: "test",
			intervalSeconds: 10,
			createdAt: created.toISOString(),
		};
		const next = getNextFireTime(job);
		expect(next).toBeInstanceOf(Date);
		// Should be ~5s from now (created 5s ago, interval 10s, next fire at 10s mark)
		expect(next!.getTime()).toBeGreaterThan(Date.now());
		expect(next!.getTime()).toBeLessThan(Date.now() + 11_000);
	});

	it("calculates next fire for cron job", () => {
		const job: Job = {
			id: "d",
			type: "cron",
			message: "test",
			expression: "* * * * *", // every minute
			createdAt: new Date().toISOString(),
		};
		const next = getNextFireTime(job);
		expect(next).toBeInstanceOf(Date);
		expect(next!.getTime()).toBeGreaterThan(Date.now());
		// Should be within 60 seconds
		expect(next!.getTime()).toBeLessThan(Date.now() + 61_000);
	});

	it("returns null for unknown job type", () => {
		const job = { id: "e", type: "unknown" as "at", message: "test", createdAt: new Date().toISOString() };
		expect(getNextFireTime(job)).toBeNull();
	});
});

describe("formatJob", () => {
	it("formats at job", () => {
		const job: Job = {
			id: "abc",
			type: "at",
			message: "reminder",
			datetime: "2030-01-01T12:00:00Z",
			createdAt: new Date().toISOString(),
		};
		const result = formatJob(job);
		expect(result).toContain("[abc]");
		expect(result).toContain("at 2030-01-01T12:00:00Z");
		expect(result).toContain('"reminder"');
	});

	it("formats every job with next time", () => {
		const job: Job = {
			id: "def",
			type: "every",
			message: "check",
			intervalSeconds: 300,
			createdAt: new Date().toISOString(),
		};
		const result = formatJob(job);
		expect(result).toContain("[def]");
		expect(result).toContain("every 300s");
		expect(result).toContain("next=");
	});

	it("formats cron job with timezone", () => {
		const job: Job = {
			id: "ghi",
			type: "cron",
			message: "backup",
			expression: "0 2 * * *",
			timezone: "America/New_York",
			createdAt: new Date().toISOString(),
		};
		const result = formatJob(job);
		expect(result).toContain("[ghi]");
		expect(result).toContain("cron 0 2 * * *");
		expect(result).toContain("(America/New_York)");
	});

	it("includes label when present", () => {
		const job: Job = {
			id: "jkl",
			type: "at",
			message: "test",
			label: "My Reminder",
			datetime: "2030-06-01T00:00:00Z",
			createdAt: new Date().toISOString(),
		};
		expect(formatJob(job)).toContain("(My Reminder)");
	});
});
