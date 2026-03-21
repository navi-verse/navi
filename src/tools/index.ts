import type { AgentTool } from "@mariozechner/pi-agent-core";
import { attachTool } from "./attach.js";
import { createBashTool } from "./bash.js";
import { createEditTool } from "./edit.js";
import { createReadTool } from "./read.js";
import { createWebFetchTool, createWebSearchTool } from "./web.js";
import { createWriteTool } from "./write.js";

export { setUploadFunction } from "./attach.js";

export function createNvTools(scratchDir?: string): AgentTool<any>[] {
	return [
		createReadTool(),
		createBashTool(scratchDir),
		createEditTool(),
		createWriteTool(),
		attachTool,
		createWebSearchTool(),
		createWebFetchTool(),
	];
}
