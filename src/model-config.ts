import { getModel } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

export function loadModelConfig(): ModelConfig {
	if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
	try {
		const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as ModelConfig;
		if (!data.primary?.provider || !data.primary?.model) return DEFAULT_CONFIG;
		return data;
	} catch {
		return DEFAULT_CONFIG;
	}
}

export function saveModelConfig(config: ModelConfig): void {
	const dir = dirname(CONFIG_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
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
