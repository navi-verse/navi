import { describe, expect, it } from "vitest";
import { type BuildSystemPromptOptions, buildSystemPrompt, jobPrompt, routineCheckPrompt } from "./prompts";

const baseOpts: BuildSystemPromptOptions = {
	soul: "You are Navi.",
	soulSource: "/path/to/SOUL.md",
	agents:
		"Contact: {{contactId}}, Playground: {{playground}}, Brain: {{brainDir}}, History: {{history}}, Routines: {{routines}}, Name: {{contactName}}, Project: {{projectRoot}}, Data: {{dataDir}}",
	agentsSource: "/path/to/AGENTS.md",
	contactId: "123@s.whatsapp.net",
	contactName: "Alice",
	playground: "/home/navi/playground",
	brainDir: "/home/navi/brain",
	history: "/home/navi/HISTORY.md",
	routines: "/home/navi/ROUTINES.md",
	projectRoot: "/home/navi/project",
	dataDir: "/home/navi/data",
	globalContent: "",
};

describe("buildSystemPrompt", () => {
	it("includes soul content with source comment", () => {
		const result = buildSystemPrompt(baseOpts);
		expect(result).toContain("<!-- source: /path/to/SOUL.md -->");
		expect(result).toContain("You are Navi.");
	});

	it("replaces all placeholders in agents", () => {
		const result = buildSystemPrompt(baseOpts);
		expect(result).toContain("Contact: 123@s.whatsapp.net");
		expect(result).toContain("Playground: /home/navi/playground");
		expect(result).toContain("Brain: /home/navi/brain");
		expect(result).toContain("History: /home/navi/HISTORY.md");
		expect(result).toContain("Routines: /home/navi/ROUTINES.md");
		expect(result).toContain("Name: Alice");
		expect(result).toContain("Project: /home/navi/project");
		expect(result).toContain("Data: /home/navi/data");
	});

	it("includes global content when present", () => {
		const result = buildSystemPrompt({ ...baseOpts, globalContent: "Global brain notes" });
		expect(result).toContain("Global brain notes");
		expect(result).toContain("<!-- source: /home/navi/brain/GLOBAL.md -->");
	});

	it("omits global section when empty", () => {
		const result = buildSystemPrompt(baseOpts);
		expect(result).not.toContain("GLOBAL.md");
	});
});

describe("jobPrompt", () => {
	it("includes job firing prefix and message", () => {
		const result = jobPrompt("Check the weather");
		expect(result).toMatch(/^\[Job firing\] \d{4}-\d{2}-\d{2}T/);
		expect(result).toContain("Check the weather");
	});
});

describe("routineCheckPrompt", () => {
	it("includes routine check prefix and content", () => {
		const result = routineCheckPrompt("- Water the plants");
		expect(result).toMatch(/^\[Routine check\] \d{4}-\d{2}-\d{2}T/);
		expect(result).toContain("- Water the plants");
	});
});
