import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import * as log from "./log.js";

const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // Jessica — Playful, Bright, Warm
const DEFAULT_MODEL = "eleven_multilingual_v2";

async function getElevenLabsApiKey(): Promise<string | undefined> {
	if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	return authStorage.getApiKey("elevenlabs");
}

export async function textToSpeech(text: string, outputPath: string, voiceId?: string): Promise<boolean> {
	const apiKey = await getElevenLabsApiKey();
	if (!apiKey) {
		log.logWarning("ElevenLabs API key not found, skipping TTS", "Set with: nv --set-key elevenlabs <key>");
		return false;
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);

		const response = await fetch(`${TTS_URL}/${voiceId || DEFAULT_VOICE_ID}?output_format=mp3_44100_128`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"xi-api-key": apiKey,
			},
			body: JSON.stringify({
				text,
				model_id: DEFAULT_MODEL,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeout);

		if (!response.ok) {
			const error = await response.text();
			log.logWarning(`TTS failed: ${response.status}`, error);
			return false;
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		writeFileSync(outputPath, buffer);
		return true;
	} catch (err) {
		log.logWarning("TTS error", err instanceof Error ? err.message : String(err));
		return false;
	}
}
