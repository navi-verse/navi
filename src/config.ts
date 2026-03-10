// config.ts — Edit this to customize your assistant

export const config = {
	// ── Who can talk to the bot ──────────────────────────────
	// WhatsApp JIDs of allowed contacts. Empty array = allow everyone.
	// Format: "19995551234@s.whatsapp.net" (country code + number)
	allowedJids: [
		"41788771003@s.whatsapp.net", // andy
		"41795397073@s.whatsapp.net", // nadine
	] as string[],

	// ── Pi agent settings ────────────────────────────────────
	// Working directory the agent operates in (careful — it has shell access)
	agentCwd: process.env.AGENT_CWD || process.cwd(),

	// System prompt prepended to every session
	systemPrompt: `You are Navi, a helpful personal assistant on WhatsApp.
Keep responses concise — this is a chat, not a document.
Use short paragraphs, no markdown headers or bullet points.
If the user asks you to do something on the computer, you have shell access via bash.`,

	// Enable/disable compaction for long conversations
	compaction: true,

	// ── Session behavior ─────────────────────────────────────
	// "persistent" = sessions saved to disk, survive restarts
	// "memory"     = sessions reset on restart
	sessionMode: "persistent" as "persistent" | "memory",

	// Directory for persistent Pi sessions
	sessionsDir: "./data/pi-sessions",

	// Directory for Baileys auth state
	baileysAuthDir: "./data/baileys-auth",
};
