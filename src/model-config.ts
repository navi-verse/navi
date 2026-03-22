import { getModel } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export interface ModelEntry {
	provider: string;
	model: string;
}

export interface ModelConfig {
	primary: ModelEntry;
	fallback?: ModelEntry;
}

const CONFIG_PATH = join(homedir(), ".nv", "model.json");

const DEFAULT_CONFIG: ModelConfig = {
	primary: { provider: "anthropic", model: "claude-sonnet-4-6" },
};

export function loadModelConfig(chatDir?: string): ModelConfig {
	// Per-chat override takes priority
	if (chatDir) {
		const chatConfigPath = join(chatDir, "model.json");
		if (existsSync(chatConfigPath)) {
			try {
				const data = JSON.parse(readFileSync(chatConfigPath, "utf-8")) as ModelConfig;
				if (data.primary?.provider && data.primary?.model) return data;
			} catch {}
		}
	}
	// Fall back to global
	if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
	try {
		const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as ModelConfig;
		if (!data.primary?.provider || !data.primary?.model) return DEFAULT_CONFIG;
		return data;
	} catch {
		return DEFAULT_CONFIG;
	}
}

export function saveModelConfig(config: ModelConfig, chatDir?: string): void {
	const path = chatDir ? join(chatDir, "model.json") : CONFIG_PATH;
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(path, JSON.stringify(config, null, 2));
}

export function clearChatModelConfig(chatDir: string): boolean {
	const chatConfigPath = join(chatDir, "model.json");
	if (existsSync(chatConfigPath)) {
		unlinkSync(chatConfigPath);
		return true;
	}
	return false;
}

export function resolveModel(entry: ModelEntry): any {
	return getModel(entry.provider as any, entry.model as any);
}

export function formatModelName(entry: ModelEntry): string {
	return `${entry.provider}/${entry.model}`;
}

export function shouldFallback(errorMessage: string): boolean {
	const patterns = [
		"Authentication failed",
		"No API key",
		"expired",
		"401",
		"403",
		"429",
		"overloaded",
		"529",
		"re-authenticate",
	];
	return patterns.some((p) => errorMessage.includes(p));
}
