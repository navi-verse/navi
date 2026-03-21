import type { AgentTool } from "@mariozechner/pi-agent-core";
import { attachTool } from "./attach.js";
import { createBashTool } from "./bash.js";
import { createEditTool } from "./edit.js";
import { createReadTool } from "./read.js";
import { createTtsTool } from "./tts.js";
import { createWebFetchTool, createWebSearchTool } from "./web.js";
import { createContactTool, createLocationTool, createReactTool, createReplyTool } from "./whatsapp.js";
import { createWriteTool } from "./write.js";

export { setUploadFunction } from "./attach.js";
export { setSendVoiceFunction } from "./tts.js";
export { setReactFunction, setReplyFunction, setSendContactFunction, setSendLocationFunction } from "./whatsapp.js";

export function createNvTools(scratchDir?: string): AgentTool<any>[] {
	return [
		createReadTool(),
		createBashTool(scratchDir),
		createEditTool(),
		createWriteTool(),
		attachTool,
		createWebSearchTool(),
		createWebFetchTool(),
		createTtsTool(scratchDir),
		createReactTool(),
		createReplyTool(),
		createLocationTool(),
		createContactTool(),
	];
}
