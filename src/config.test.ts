import { describe, expect, it } from "vitest";
import { contactIdFromDirName, extractFields, getChatDirName, getChatPaths } from "./config";

describe("getChatDirName", () => {
	it("maps s.whatsapp.net to s_ prefix", () => {
		expect(getChatDirName("1234567890@s.whatsapp.net")).toBe("s_1234567890");
	});

	it("maps g.us to g_ prefix", () => {
		expect(getChatDirName("groupid@g.us")).toBe("g_groupid");
	});

	it("maps lid to l_ prefix", () => {
		expect(getChatDirName("lidid@lid")).toBe("l_lidid");
	});

	it("defaults to s_ for unknown domains", () => {
		expect(getChatDirName("user@unknown.domain")).toBe("s_user");
	});
});

describe("contactIdFromDirName", () => {
	it("maps s_ prefix to s.whatsapp.net", () => {
		expect(contactIdFromDirName("s_1234567890")).toBe("1234567890@s.whatsapp.net");
	});

	it("maps g_ prefix to g.us", () => {
		expect(contactIdFromDirName("g_groupid")).toBe("groupid@g.us");
	});

	it("maps l_ prefix to lid", () => {
		expect(contactIdFromDirName("l_lidid")).toBe("lidid@lid");
	});

	it("defaults to s.whatsapp.net for unknown prefix", () => {
		expect(contactIdFromDirName("x_unknown")).toBe("unknown@s.whatsapp.net");
	});

	it("round-trips with getChatDirName", () => {
		const ids = ["123@s.whatsapp.net", "abc@g.us", "xyz@lid"];
		for (const id of ids) {
			expect(contactIdFromDirName(getChatDirName(id))).toBe(id);
		}
	});
});

describe("getChatPaths", () => {
	it("returns correct structure for a whatsapp contact", () => {
		const paths = getChatPaths("123@s.whatsapp.net");
		expect(paths.root).toContain("s_123");
		expect(paths.playground).toBe(`${paths.root}/playground`);
		expect(paths.media).toBe(`${paths.playground}/media`);
		expect(paths.session).toBe(`${paths.root}/session`);
		expect(paths.history).toBe(`${paths.root}/HISTORY.md`);
		expect(paths.routines).toBe(`${paths.root}/ROUTINES.md`);
		expect(paths.jobs).toBe(`${paths.root}/jobs.json`);
		expect(paths.soul).toBe(`${paths.root}/SOUL.md`);
	});
});

describe("extractFields", () => {
	it("extracts trailing object as fields", () => {
		const args: unknown[] = ["hello", { foo: 1 }];
		const result = extractFields(args);
		expect(result.msg).toBe("hello");
		expect(result.fields).toEqual({ foo: 1 });
	});

	it("joins multiple string args", () => {
		const args: unknown[] = ["hello", "world"];
		const result = extractFields(args);
		expect(result.msg).toBe("hello world");
		expect(result.fields).toEqual({});
	});

	it("returns empty fields when last arg is not an object", () => {
		const args: unknown[] = ["hello"];
		const result = extractFields(args);
		expect(result.msg).toBe("hello");
		expect(result.fields).toEqual({});
	});

	it("does not treat arrays as fields", () => {
		const args: unknown[] = ["hello", [1, 2]];
		const result = extractFields(args);
		expect(result.msg).toBe("hello [1,2]");
		expect(result.fields).toEqual({});
	});

	it("does not treat Errors as fields", () => {
		const args: unknown[] = ["fail", new Error("boom")];
		const result = extractFields(args);
		expect(result.fields).toEqual({});
	});
});
