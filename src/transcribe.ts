import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import * as log from "./log.js";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3";

async function getGroqApiKey(): Promise<string | undefined> {
	if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	return authStorage.getApiKey("groq");
}

export async function transcribeAudio(filePath: string): Promise<string | null> {
	const apiKey = await getGroqApiKey();
	if (!apiKey) {
		log.logWarning("Groq API key not found, skipping transcription", "Set with: nv --set-key groq <key>");
		return null;
	}

	try {
		const fileData = readFileSync(filePath);
		const fileName = basename(filePath);

		const form = new FormData();
		form.append("file", new Blob([fileData]), fileName);
		form.append("model", WHISPER_MODEL);

		const response = await fetch(GROQ_TRANSCRIPTION_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}` },
			body: form,
		});

		if (!response.ok) {
			const error = await response.text();
			log.logWarning(`Transcription failed: ${response.status}`, error);
			return null;
		}

		const result = (await response.json()) as { text?: string };
		return result.text?.trim() || null;
	} catch (err) {
		log.logWarning("Transcription error", err instanceof Error ? err.message : String(err));
		return null;
	}
}
