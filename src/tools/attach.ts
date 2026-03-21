import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { basename, resolve as resolvePath } from "path";

let uploadFn: ((filePath: string, title?: string) => Promise<void>) | null = null;

export function setUploadFunction(fn: (filePath: string, title?: string) => Promise<void>): void {
	uploadFn = fn;
}

const attachSchema = Type.Object({
	label: Type.String({ description: "Brief description of what you're sharing (shown to user)" }),
	path: Type.String({ description: "Path to the file to attach" }),
	title: Type.Optional(Type.String({ description: "Title for the file (defaults to filename)" })),
});

export const attachTool: AgentTool<typeof attachSchema> = {
	name: "attach",
	label: "attach",
	description:
		"Send a file to the user via WhatsApp. Supports images (jpg, png, webp), GIFs (gif), videos (mp4, mov), audio (mp3, ogg, wav), PDFs, and any other file type. Use bash to download files first (e.g. curl -o file.gif URL), then attach them.",
	parameters: attachSchema,
	execute: async (
		_toolCallId: string,
		{ path, title }: { label: string; path: string; title?: string },
		signal?: AbortSignal,
	) => {
		if (!uploadFn) {
			throw new Error("Upload function not configured");
		}

		if (signal?.aborted) {
			throw new Error("Operation aborted");
		}

		const absolutePath = resolvePath(path);
		const fileName = title || basename(absolutePath);

		await uploadFn(absolutePath, fileName);

		return {
			content: [{ type: "text" as const, text: `Attached file: ${fileName}` }],
			details: undefined,
		};
	},
};
