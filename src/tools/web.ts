import type { AgentTool } from "@mariozechner/pi-agent-core";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { join } from "path";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";

const JINA_READER_URL = "https://r.jina.ai/";

const webFetchSchema = Type.Object({
	label: Type.String({ description: "Brief description of what you're fetching and why (shown to user)" }),
	url: Type.String({ description: "URL to fetch content from" }),
});

export function createWebFetchTool(): AgentTool<typeof webFetchSchema> {
	return {
		name: "web_fetch",
		label: "web_fetch",
		description:
			"Fetch a web page and return its content as clean markdown. Use this to read articles, documentation, or any web page.",
		parameters: webFetchSchema,
		execute: async (_toolCallId: string, { url }: { label: string; url: string }, signal?: AbortSignal) => {
			let content: string;

			// Try Jina Reader first, fall back to direct fetch
			const jinaResponse = await fetch(`${JINA_READER_URL}${url}`, {
				headers: { Accept: "text/markdown" },
				signal,
			});

			if (jinaResponse.ok) {
				content = await jinaResponse.text();
			} else {
				// Fallback: direct fetch
				const directResponse = await fetch(url, {
					headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
					signal,
				});
				if (!directResponse.ok) {
					throw new Error(`Failed to fetch ${url}: ${directResponse.status} ${directResponse.statusText}`);
				}
				content = await directResponse.text();
			}
			const truncation = truncateHead(content);

			let outputText = truncation.content || "(empty page)";
			if (truncation.truncated) {
				outputText += `\n\n[Content truncated at ${formatSize(DEFAULT_MAX_BYTES)}]`;
			}

			return {
				content: [{ type: "text", text: outputText }],
				details: undefined,
			};
		},
	};
}

async function getBraveApiKey(): Promise<string | undefined> {
	// Check env var first
	if (process.env.BRAVE_API_KEY) return process.env.BRAVE_API_KEY;
	// Then check auth storage
	const authStorage = AuthStorage.create(join(homedir(), ".nv", "auth.json"));
	return authStorage.getApiKey("brave");
}

interface BraveResult {
	title?: string;
	url?: string;
	description?: string;
}

interface BraveResponse {
	web?: { results?: BraveResult[] };
	query?: { original?: string };
}

function formatBraveResults(data: BraveResponse): string {
	const results = data.web?.results;
	if (!results || results.length === 0) return "";

	const parts: string[] = [];
	for (const r of results) {
		if (r.title && r.url) {
			parts.push(`### ${r.title}\n${r.url}\n${r.description || ""}`);
		}
	}
	return parts.join("\n\n");
}

const webSearchSchema = Type.Object({
	label: Type.String({ description: "Brief description of what you're searching for (shown to user)" }),
	query: Type.String({ description: "Search query" }),
	count: Type.Optional(Type.Number({ description: "Number of results (default 5, max 20)" })),
});

export function createWebSearchTool(): AgentTool<typeof webSearchSchema> {
	return {
		name: "web_search",
		label: "web_search",
		description: "Search the web using Brave Search. Returns titles, URLs, and descriptions. Requires BRAVE_API_KEY.",
		parameters: webSearchSchema,
		execute: async (
			_toolCallId: string,
			{ query, count }: { label: string; query: string; count?: number },
			signal?: AbortSignal,
		) => {
			const apiKey = await getBraveApiKey();
			if (!apiKey) {
				throw new Error(
					"Brave API key not found. Set it with: nv --set-key brave <key>\nGet a free key at https://brave.com/search/api/",
				);
			}

			const numResults = Math.min(count || 5, 20);
			const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;
			const response = await fetch(url, {
				headers: {
					Accept: "application/json",
					"Accept-Encoding": "gzip",
					"X-Subscription-Token": apiKey,
				},
				signal,
			});

			if (!response.ok) {
				throw new Error(`Search failed: ${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as BraveResponse;
			const formatted = formatBraveResults(data);

			if (!formatted.trim()) {
				return {
					content: [{ type: "text", text: `No results found for "${query}".` }],
					details: undefined,
				};
			}

			const truncation = truncateHead(formatted);
			let outputText = truncation.content;
			if (truncation.truncated) {
				outputText += `\n\n[Results truncated at ${formatSize(DEFAULT_MAX_BYTES)}]`;
			}

			return {
				content: [{ type: "text", text: outputText }],
				details: undefined,
			};
		},
	};
}
