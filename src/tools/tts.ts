import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { join } from "path";
import { textToSpeech } from "../tts.js";

let sendVoiceFn: ((filePath: string) => Promise<void>) | null = null;

export function setSendVoiceFunction(fn: (filePath: string) => Promise<void>): void {
	sendVoiceFn = fn;
}

const ttsSchema = Type.Object({
	label: Type.String({ description: "Brief description (shown to user)" }),
	text: Type.String({ description: "Text to speak" }),
});

export function createTtsTool(scratchDir?: string): AgentTool<typeof ttsSchema> {
	return {
		name: "tts",
		label: "tts",
		description:
			"Convert text to speech and send as a WhatsApp voice note. Use when the user asks for a voice reply, wants something read aloud, or when a voice message feels more natural than text.",
		parameters: ttsSchema,
		execute: async (_toolCallId: string, { text }: { label: string; text: string }, signal?: AbortSignal) => {
			if (!sendVoiceFn) {
				throw new Error("Voice send function not configured");
			}

			if (signal?.aborted) {
				throw new Error("Operation aborted");
			}

			const outputPath = join(scratchDir || "/tmp", `tts_${Date.now()}.mp3`);
			const success = await textToSpeech(text, outputPath);

			if (!success) {
				return {
					content: [
						{ type: "text", text: `TTS unavailable, respond with text instead. Original message: ${text}` },
					],
					details: undefined,
				};
			}

			await sendVoiceFn(outputPath);

			return {
				content: [{ type: "text", text: "Voice note sent." }],
				details: undefined,
			};
		},
	};
}
