import { describe, expect, it } from "vitest";
import { htmlToText } from "./web";

describe("htmlToText", () => {
	it("strips HTML tags", () => {
		expect(htmlToText("<p>Hello <b>world</b></p>")).toBe("Hello world");
	});

	it("removes script blocks", () => {
		expect(htmlToText('<script>alert("xss")</script>Content')).toBe("Content");
	});

	it("removes style blocks", () => {
		expect(htmlToText("<style>body { color: red }</style>Content")).toBe("Content");
	});

	it("converts block elements to newlines", () => {
		const result = htmlToText("<p>One</p><p>Two</p>");
		expect(result).toContain("One");
		expect(result).toContain("Two");
		expect(result).toMatch(/One\n+.*Two/);
	});

	it("decodes HTML entities", () => {
		expect(htmlToText("&amp; &lt; &gt; &quot; &#39; &nbsp;")).toBe("& < > \" '");
	});

	it("collapses excessive whitespace", () => {
		expect(htmlToText("hello     world")).toBe("hello world");
	});

	it("collapses excessive newlines", () => {
		const result = htmlToText("<p></p><p></p><p></p><p>Content</p>");
		expect(result).not.toMatch(/\n{3,}/);
	});

	it("handles empty input", () => {
		expect(htmlToText("")).toBe("");
	});

	it("handles plain text (no HTML)", () => {
		expect(htmlToText("just plain text")).toBe("just plain text");
	});
});
