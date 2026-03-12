// prompts.ts — System prompt composition and event prompts

interface BuildSystemPromptOptions {
	soul: string;
	soulSource: string;
	agents: string;
	agentsSource: string;
	contactId: string;
	playground: string;
	outbox: string;
	brainDir: string;
	history: string;
	routines: string;
	globalContent: string;
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
	const agents = opts.agents
		.replace(/\{\{contactId\}\}/g, opts.contactId)
		.replace(/\{\{playground\}\}/g, opts.playground)
		.replace(/\{\{outbox\}\}/g, opts.outbox)
		.replace(/\{\{brainDir\}\}/g, opts.brainDir)
		.replace(/\{\{history\}\}/g, opts.history)
		.replace(/\{\{routines\}\}/g, opts.routines);

	const lines = [`<!-- source: ${opts.soulSource} -->`, opts.soul, "", `<!-- source: ${opts.agentsSource} -->`, agents];

	if (opts.globalContent) {
		lines.push("", `<!-- source: ${opts.brainDir}/GLOBAL.md -->`, "", opts.globalContent);
	}
	return lines.join("\n");
}

export function jobPrompt(message: string) {
	return `[Job firing] ${new Date().toISOString()}\n\n${message}`;
}

export function routineCheckPrompt(content: string) {
	return `[Routine check] ${new Date().toISOString()}\n\n${content}`;
}
