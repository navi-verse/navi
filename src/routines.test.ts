import { describe, expect, it } from "vitest";
import { hasRealTasks } from "./routines";

describe("hasRealTasks", () => {
	it("returns false for template-only content", () => {
		expect(hasRealTasks("# Routines\n\n(Tasks to check periodically. One per line.)")).toBe(false);
	});

	it("returns false for header only", () => {
		expect(hasRealTasks("# Routines")).toBe(false);
	});

	it("returns false for empty string", () => {
		expect(hasRealTasks("")).toBe(false);
	});

	it("returns false for blank lines only", () => {
		expect(hasRealTasks("# Routines\n\n\n")).toBe(false);
	});

	it("returns true when real tasks exist", () => {
		expect(hasRealTasks("# Routines\n\n- Check server status")).toBe(true);
	});

	it("returns true for mixed content", () => {
		expect(hasRealTasks("# Routines\n\n(Tasks to check periodically. One per line.)\n\n- Water plants")).toBe(true);
	});
});
