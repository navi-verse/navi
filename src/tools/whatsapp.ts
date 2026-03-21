import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";

let reactFn: ((emoji: string) => Promise<void>) | null = null;
let replyFn: ((messageId: string, text: string) => Promise<void>) | null = null;
let sendLocationFn: ((lat: number, lng: number, name?: string) => Promise<void>) | null = null;
let sendContactFn: ((name: string, phone: string) => Promise<void>) | null = null;

export function setReactFunction(fn: (emoji: string) => Promise<void>): void {
	reactFn = fn;
}

export function setReplyFunction(fn: (messageId: string, text: string) => Promise<void>): void {
	replyFn = fn;
}

export function setSendLocationFunction(fn: (lat: number, lng: number, name?: string) => Promise<void>): void {
	sendLocationFn = fn;
}

export function setSendContactFunction(fn: (name: string, phone: string) => Promise<void>): void {
	sendContactFn = fn;
}

const reactSchema = Type.Object({
	label: Type.String({ description: "Brief description (shown to user)" }),
	emoji: Type.String({ description: "Single emoji to react with" }),
});

export function createReactTool(): AgentTool<typeof reactSchema> {
	return {
		name: "react",
		label: "react",
		description:
			"React to the current message with an emoji. Use sparingly — mainly in groups to acknowledge without cluttering, or to react to older messages. Don't react to every message.",
		parameters: reactSchema,
		execute: async (_toolCallId: string, { emoji }: { label: string; emoji: string }) => {
			if (!reactFn) throw new Error("React function not configured");
			await reactFn(emoji);
			return { content: [{ type: "text", text: `Reacted with ${emoji}` }], details: undefined };
		},
	};
}

const replySchema = Type.Object({
	label: Type.String({ description: "Brief description (shown to user)" }),
	messageId: Type.String({ description: "ID of the message to reply to" }),
	text: Type.String({ description: "Reply text" }),
});

export function createReplyTool(): AgentTool<typeof replySchema> {
	return {
		name: "reply",
		label: "reply",
		description:
			"Reply to a specific message (shows as a quoted reply in WhatsApp). Use when answering one of several questions in different bubbles, or when context matters. Don't use for every response — a normal message is usually better.",
		parameters: replySchema,
		execute: async (_toolCallId: string, { messageId, text }: { label: string; messageId: string; text: string }) => {
			if (!replyFn) throw new Error("Reply function not configured");
			await replyFn(messageId, text);
			return { content: [{ type: "text", text: `Replied to message` }], details: undefined };
		},
	};
}

const locationSchema = Type.Object({
	label: Type.String({ description: "Brief description (shown to user)" }),
	latitude: Type.Number({ description: "Latitude" }),
	longitude: Type.Number({ description: "Longitude" }),
	name: Type.Optional(Type.String({ description: "Location name" })),
});

export function createLocationTool(): AgentTool<typeof locationSchema> {
	return {
		name: "send_location",
		label: "send_location",
		description: "Send a location pin in WhatsApp. Use when sharing addresses, meeting points, or places.",
		parameters: locationSchema,
		execute: async (
			_toolCallId: string,
			{ latitude, longitude, name }: { label: string; latitude: number; longitude: number; name?: string },
		) => {
			if (!sendLocationFn) throw new Error("Location function not configured");
			await sendLocationFn(latitude, longitude, name);
			return {
				content: [{ type: "text", text: `Sent location: ${name || `${latitude},${longitude}`}` }],
				details: undefined,
			};
		},
	};
}

const contactSchema = Type.Object({
	label: Type.String({ description: "Brief description (shown to user)" }),
	name: Type.String({ description: "Contact display name" }),
	phone: Type.String({ description: "Phone number with country code (e.g. +41791234567)" }),
});

export function createContactTool(): AgentTool<typeof contactSchema> {
	return {
		name: "send_contact",
		label: "send_contact",
		description: "Send a contact card in WhatsApp.",
		parameters: contactSchema,
		execute: async (_toolCallId: string, { name, phone }: { label: string; name: string; phone: string }) => {
			if (!sendContactFn) throw new Error("Contact function not configured");
			await sendContactFn(name, phone);
			return { content: [{ type: "text", text: `Sent contact: ${name}` }], details: undefined };
		},
	};
}
