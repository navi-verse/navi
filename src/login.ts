// login.ts — Interactive login: OAuth providers + API keys
// Usage: npx tsx src/login.ts

import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { getOAuthProviders } from "@mariozechner/pi-ai/oauth";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { dataDir } from "./config";

const settingsPath = join(dataDir, "settings.json");
const authStorage = AuthStorage.create(join(dataDir, "auth.json"));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

const RECOMMENDED_MODELS: Record<string, string> = {
	anthropic: "anthropic/claude-sonnet-4-6",
	"github-copilot": "github-copilot/claude-sonnet-4.6",
	"google-gemini-cli": "google-gemini-cli/gemini-3.1-pro-preview",
	"google-antigravity": "google-antigravity/gemini-3.1-pro-high",
	"openai-codex": "openai-codex/gpt-5.4",
};

const API_KEY_PROVIDERS = [
	{ id: "openai", name: "OpenAI" },
	{ id: "groq", name: "Groq" },
	{ id: "google", name: "Google (Gemini)" },
	{ id: "brave", name: "Brave Search" },
];

function openBrowser(url: string) {
	const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	exec(`${cmd} "${url}"`);
}

async function suggestModel(providerId: string) {
	const model = RECOMMENDED_MODELS[providerId];
	if (!model) return;

	const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf-8")) : {};
	if (settings.model === model) {
		console.log(`\n📌 Model: ${model}`);
		return;
	}

	const answer = await ask(`\n💡 Set model to ${model}? [Y/n] `);
	if (answer.trim().toLowerCase() !== "n") {
		settings.model = model;
		writeFileSync(settingsPath, `${JSON.stringify(settings, null, "\t")}\n`);
		console.log(`📌 Model: ${model}`);
	}
}

async function loginOAuth(providerId: string) {
	const providers = getOAuthProviders();
	const provider = providers.find((p) => p.id === providerId);
	if (!provider) {
		console.log(`❌ Unknown OAuth provider: ${providerId}`);
		return;
	}

	console.log(`\n🔐 Logging in to ${provider.name}...`);

	const credentials = await provider.login({
		onAuth(info) {
			console.log(`\n🌐 Opening browser for authorization...`);
			console.log(`   ${info.url}\n`);
			openBrowser(info.url);
			if (info.instructions) console.log(`   ${info.instructions}\n`);
		},
		async onPrompt(prompt) {
			return await ask(`${prompt.message} `);
		},
		onProgress(message) {
			console.log(`   ${message}`);
		},
		async onManualCodeInput() {
			return await ask("Enter the authorization code: ");
		},
	});

	authStorage.set(providerId, { type: "oauth", ...credentials });
	console.log(`\n✅ ${provider.name}: logged in`);
	await suggestModel(providerId);
}

async function loginApiKey(providerId: string, name: string) {
	const key = await ask(`\n🔑 Enter ${name} API key: `);
	if (!key.trim()) {
		console.log("❌ No key entered.");
		return;
	}
	authStorage.set(providerId, { type: "api_key", key: key.trim() });
	console.log(`✅ ${name}: API key saved`);
}

async function main() {
	const oauthProviders = getOAuthProviders();

	console.log("\n🤖 Navi Login\n");
	console.log("OAuth providers:");
	oauthProviders.forEach((p, i) => {
		const status = authStorage.has(p.id) ? " ✅" : "";
		console.log(`  ${i + 1}. ${p.name}${status}`);
	});

	console.log("\nAPI key providers:");
	API_KEY_PROVIDERS.forEach((p, i) => {
		const status = authStorage.has(p.id) ? " ✅" : "";
		console.log(`  ${oauthProviders.length + i + 1}. ${p.name}${status}`);
	});

	console.log(`\n  0. Exit`);

	const choice = await ask("\nSelect provider: ");
	const num = Number.parseInt(choice, 10);

	if (num === 0 || Number.isNaN(num)) {
		rl.close();
		return;
	}

	if (num >= 1 && num <= oauthProviders.length) {
		await loginOAuth(oauthProviders[num - 1].id);
	} else if (num > oauthProviders.length && num <= oauthProviders.length + API_KEY_PROVIDERS.length) {
		const p = API_KEY_PROVIDERS[num - oauthProviders.length - 1];
		await loginApiKey(p.id, p.name);
	} else {
		console.log("❌ Invalid selection.");
	}

	rl.close();
}

main().catch((err) => {
	console.error("Error:", err);
	rl.close();
	process.exit(1);
});
