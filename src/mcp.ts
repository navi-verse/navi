// mcp.ts — MCP client: connect to external MCP servers, discover tools, wrap as Pi SDK ToolDefinitions

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Type } from "@sinclair/typebox";
import type { McpServerConfig } from "./config";
import { config, log, logError } from "./config";

interface McpConnection {
	client: Client;
	transport: StdioClientTransport | StreamableHTTPClientTransport;
}

const connections: McpConnection[] = [];
let mcpTools: ToolDefinition[] = [];

function createTransport(cfg: McpServerConfig): StdioClientTransport | StreamableHTTPClientTransport {
	if (cfg.command) {
		return new StdioClientTransport({
			command: cfg.command,
			args: cfg.args,
			env: cfg.env ? ({ ...process.env, ...cfg.env } as Record<string, string>) : undefined,
		});
	}
	if (cfg.url) {
		return new StreamableHTTPClientTransport(new URL(cfg.url));
	}
	throw new Error("MCP server config must have either 'command' or 'url'");
}

export async function connectMcpServers(): Promise<void> {
	const servers = config.mcpServers;
	if (!servers || Object.keys(servers).length === 0) return;

	const discovered: ToolDefinition[] = [];

	for (const [name, cfg] of Object.entries(servers)) {
		try {
			const transport = createTransport(cfg);
			const client = new Client({ name: `navi-${name}`, version: "1.0.0" });
			await client.connect(transport);

			const { tools } = await client.listTools();

			for (const tool of tools) {
				const serverName = name;
				const clientRef = client;

				discovered.push({
					name: `mcp_${serverName}_${tool.name}`,
					label: `${serverName}: ${tool.name}`,
					description: tool.description ?? `MCP tool ${tool.name} from ${serverName}`,
					parameters: Type.Unsafe(tool.inputSchema),
					async execute(_toolCallId, params) {
						try {
							const result = await clientRef.callTool({
								name: tool.name,
								arguments: params as Record<string, unknown>,
							});
							const text = (result.content as Array<{ type: string; text?: string }>)
								.filter((c) => c.type === "text" && c.text)
								.map((c) => c.text)
								.join("\n");
							return {
								content: [{ type: "text" as const, text: text || "(no output)" }],
								details: {},
							};
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							return {
								content: [{ type: "text" as const, text: `MCP tool error: ${msg}` }],
								details: {},
							};
						}
					},
				});
			}

			connections.push({ client, transport });
			log(`🔌 MCP: ${name} connected (${tools.length} tools)`);
		} catch (err) {
			logError(`🔌 MCP: ${name} failed to connect:`, err instanceof Error ? err.message : err);
		}
	}

	mcpTools = discovered;
}

export function getMcpTools(): ToolDefinition[] {
	return mcpTools;
}

export async function disconnectMcpServers(): Promise<void> {
	for (const { client } of connections) {
		try {
			await client.close();
		} catch {
			// ignore close errors
		}
	}
	connections.length = 0;
	mcpTools = [];
}
