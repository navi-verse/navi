// web.ts — WebSearch (Brave) and WebFetch tools

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { getAuthStorage } from "./agent";

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

// ── WebSearch (Brave) ────────────────────────────────

const searchParams = Type.Object({
	query: Type.String({ description: "Search query (max 400 chars)" }),
	count: Type.Optional(Type.Number({ description: "Number of results (1-20, default 5)" })),
	freshness: Type.Optional(
		Type.String({ description: "Time filter: pd (past day), pw (past week), pm (past month), py (past year)" }),
	),
});

type SearchParams = Static<typeof searchParams>;

interface BraveResult {
	title: string;
	url: string;
	description: string;
	age?: string;
	extra_snippets?: string[];
}

export const webSearchTool: ToolDefinition = {
	name: "web_search",
	label: "Web Search",
	description: "Search the web using Brave Search. Returns titles, URLs, and snippets.",
	promptSnippet: "web_search — search the web for information",
	parameters: searchParams,
	async execute(_toolCallId, params: SearchParams) {
		const apiKey = await getAuthStorage().getApiKey("brave");
		if (!apiKey) return textResult("Error: No Brave Search API key. Run `npm run login` and add it.");

		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", params.query);
		url.searchParams.set("count", String(params.count ?? 5));
		url.searchParams.set("extra_snippets", "true");
		if (params.freshness) url.searchParams.set("freshness", params.freshness);

		const res = await fetch(url.toString(), {
			headers: {
				"X-Subscription-Token": apiKey,
				Accept: "application/json",
				"Accept-Encoding": "gzip",
			},
		});

		if (!res.ok) return textResult(`Error: Brave Search returned ${res.status} ${await res.text()}`);

		const data = (await res.json()) as { web?: { results?: BraveResult[] } };
		const results = data.web?.results;
		if (!results?.length) return textResult("No results found.");

		const formatted = results
			.map((r, i) => {
				const parts = [`${i + 1}. ${r.title}`, `   ${r.url}`, `   ${r.description}`];
				if (r.extra_snippets?.length) {
					for (const s of r.extra_snippets) parts.push(`   ${s}`);
				}
				return parts.join("\n");
			})
			.join("\n\n");

		return textResult(formatted);
	},
};

// ── WebFetch ─────────────────────────────────────────

const fetchParams = Type.Object({
	url: Type.String({ description: "URL to fetch" }),
	maxLength: Type.Optional(Type.Number({ description: "Max response length in chars (default 20000)" })),
});

type FetchParams = Static<typeof fetchParams>;

function htmlToText(html: string): string {
	return (
		html
			// Remove script and style blocks
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			// Convert block elements to newlines
			.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, "\n")
			// Remove all remaining tags
			.replace(/<[^>]+>/g, "")
			// Decode common HTML entities
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			// Collapse whitespace
			.replace(/[ \t]+/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

export const webFetchTool: ToolDefinition = {
	name: "web_fetch",
	label: "Web Fetch",
	description: "Fetch a URL and return its content as text. HTML is converted to plain text.",
	promptSnippet: "web_fetch — fetch a URL and return its content",
	parameters: fetchParams,
	async execute(_toolCallId, params: FetchParams) {
		const maxLen = params.maxLength ?? 20000;

		try {
			const res = await fetch(params.url, {
				headers: { "User-Agent": "Navi/1.0", Accept: "text/html, application/json, text/plain, */*" },
				redirect: "follow",
				signal: AbortSignal.timeout(15000),
			});

			if (!res.ok) return textResult(`Error: ${res.status} ${res.statusText}`);

			const contentType = res.headers.get("content-type") || "";
			const raw = await res.text();

			let text: string;
			if (contentType.includes("text/html")) {
				text = htmlToText(raw);
			} else {
				text = raw;
			}

			if (text.length > maxLen) {
				text = `${text.substring(0, maxLen)}\n\n[Truncated at ${maxLen} chars, total ${raw.length}]`;
			}

			return textResult(text);
		} catch (err) {
			return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	},
};
