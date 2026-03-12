// stt.ts — Speech-to-text via OpenAI gpt-4o-transcribe

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { getAuthStorage } from "./agent";
import { logError } from "./config";

const MIME_TYPES: Record<string, string> = {
	".ogg": "audio/ogg",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".wav": "audio/wav",
	".webm": "audio/webm",
	".flac": "audio/flac",
};

export async function transcribe(filePath: string): Promise<string | null> {
	const apiKey = await getAuthStorage().getApiKey("openai");
	if (!apiKey) return null;

	const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
	const mime = MIME_TYPES[ext] || "audio/ogg";
	const file = new Blob([readFileSync(filePath)], { type: mime });

	const form = new FormData();
	form.append("file", file, basename(filePath));
	form.append("model", "gpt-4o-transcribe");
	form.append("language", "de");
	form.append("prompt", "Schweizerdeutsch Transkription ins Hochdeutsche.");
	form.append("response_format", "text");

	const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}` },
		body: form,
	});

	if (!res.ok) {
		logError(`🎤 STT error: ${res.status} ${await res.text()}`);
		return null;
	}

	const text = await res.text();
	return text.trim() || null;
}
