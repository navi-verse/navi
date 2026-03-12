// reminders.ts — Reminder scheduler: at/every/cron with per-chat JSON persistence and agent tool

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { Cron } from "croner";
import { config, contactIdFromDirName, log, logError } from "./config";

// ── Types ────────────────────────────────────────────

interface Reminder {
	id: string;
	type: "at" | "every" | "cron";
	message: string;
	label?: string;
	datetime?: string;
	intervalSeconds?: number;
	expression?: string;
	timezone?: string;
	createdAt: string;
}

interface ChatReminders {
	contactId: string;
	remindersPath: string;
	reminders: Reminder[];
}

type FireCallback = (contactId: string, message: string) => Promise<void>;

// ── Persistence ──────────────────────────────────────

function loadRemindersFile(remindersPath: string): Reminder[] {
	if (!existsSync(remindersPath)) return [];
	try {
		return JSON.parse(readFileSync(remindersPath, "utf-8"));
	} catch {
		return [];
	}
}

function saveRemindersFile(remindersPath: string, reminders: Reminder[]) {
	if (reminders.length === 0) {
		if (existsSync(remindersPath)) unlinkSync(remindersPath);
		return;
	}
	writeFileSync(remindersPath, `${JSON.stringify(reminders, null, "\t")}\n`);
}

// ── Scheduler ────────────────────────────────────────

const allChats: ChatReminders[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let fireCallback: FireCallback | null = null;

function genId(): string {
	return randomBytes(4).toString("hex");
}

function getNextFireTime(reminder: Reminder): Date | null {
	const now = new Date();

	if (reminder.type === "at" && reminder.datetime) {
		const dt = new Date(reminder.datetime);
		return dt > now ? dt : null;
	}

	if (reminder.type === "every" && reminder.intervalSeconds) {
		const created = new Date(reminder.createdAt);
		const elapsed = now.getTime() - created.getTime();
		const intervalMs = reminder.intervalSeconds * 1000;
		const periods = Math.floor(elapsed / intervalMs);
		const next = new Date(created.getTime() + (periods + 1) * intervalMs);
		return next;
	}

	if (reminder.type === "cron" && reminder.expression) {
		const cron = new Cron(reminder.expression, { timezone: reminder.timezone });
		return cron.nextRun() ?? null;
	}

	return null;
}

function scheduleNext() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}

	let earliest: { chat: ChatReminders; reminder: Reminder; time: Date } | null = null;

	for (const chat of allChats) {
		for (const reminder of chat.reminders) {
			const next = getNextFireTime(reminder);
			if (next && (!earliest || next < earliest.time)) {
				earliest = { chat, reminder, time: next };
			}
		}
	}

	if (!earliest) return;

	const MAX_DELAY = 2_147_483_647;
	const delay = Math.min(MAX_DELAY, Math.max(0, earliest.time.getTime() - Date.now()));
	const { chat, reminder } = earliest;

	timer = setTimeout(async () => {
		timer = null;

		try {
			log(
				`⏰ ${chat.contactId}: reminder fired [${reminder.id}] ${reminder.label || reminder.message.substring(0, 40)}`,
			);

			if (fireCallback) {
				await fireCallback(chat.contactId, reminder.message);
			}

			if (reminder.type === "at") {
				chat.reminders = chat.reminders.filter((r) => r.id !== reminder.id);
				saveRemindersFile(chat.remindersPath, chat.reminders);
			}
		} catch (err) {
			logError(`⏰ ${chat.contactId}: reminder error [${reminder.id}]`, err);
		}

		scheduleNext();
	}, delay);
}

// ── Public API ───────────────────────────────────────

function getChatEntry(contactId: string, remindersPath: string): ChatReminders {
	let chat = allChats.find((c) => c.contactId === contactId);
	if (!chat) {
		chat = { contactId, remindersPath, reminders: loadRemindersFile(remindersPath) };
		allChats.push(chat);
	}
	return chat;
}

export function startReminders(callback: FireCallback) {
	fireCallback = callback;

	if (existsSync(config.chatsDir)) {
		for (const entry of readdirSync(config.chatsDir)) {
			const entryPath = join(config.chatsDir, entry);
			if (!statSync(entryPath).isDirectory()) continue;

			const remindersPath = join(entryPath, "reminders.json");
			if (!existsSync(remindersPath)) continue;

			const contactId = contactIdFromDirName(entry);
			const chat = getChatEntry(contactId, remindersPath);

			// Purge expired one-shot reminders
			const before = chat.reminders.length;
			chat.reminders = chat.reminders.filter(
				(r) => !(r.type === "at" && r.datetime && new Date(r.datetime) <= new Date()),
			);
			if (chat.reminders.length < before) saveRemindersFile(chat.remindersPath, chat.reminders);
		}
	}

	const totalReminders = allChats.reduce((sum, c) => sum + c.reminders.length, 0);
	log(`⏰ Reminders: ${totalReminders} reminder(s) across ${allChats.length} chat(s)`);
	scheduleNext();
}

// ── Tool ─────────────────────────────────────────────

const reminderParams = Type.Object({
	action: Type.Union([Type.Literal("create"), Type.Literal("list"), Type.Literal("remove")]),
	type: Type.Optional(Type.Union([Type.Literal("at"), Type.Literal("every"), Type.Literal("cron")])),
	message: Type.Optional(Type.String()),
	label: Type.Optional(Type.String()),
	datetime: Type.Optional(Type.String({ description: "ISO 8601 datetime for at reminders" })),
	intervalSeconds: Type.Optional(Type.Number({ description: "Interval in seconds for every reminders" })),
	expression: Type.Optional(Type.String({ description: "Cron expression for cron reminders" })),
	timezone: Type.Optional(Type.String({ description: "IANA timezone for cron reminders" })),
	id: Type.Optional(Type.String({ description: "Reminder ID for remove action" })),
});

type ReminderParams = Static<typeof reminderParams>;

function formatReminder(reminder: Reminder): string {
	const next = getNextFireTime(reminder);
	const nextStr = next ? next.toISOString() : "none";
	const label = reminder.label ? ` (${reminder.label})` : "";

	if (reminder.type === "at") return `[${reminder.id}] at ${reminder.datetime}${label} → "${reminder.message}"`;
	if (reminder.type === "every")
		return `[${reminder.id}] every ${reminder.intervalSeconds}s${label} next=${nextStr} → "${reminder.message}"`;
	if (reminder.type === "cron") {
		const tz = reminder.timezone ? ` (${reminder.timezone})` : "";
		return `[${reminder.id}] cron ${reminder.expression}${tz}${label} next=${nextStr} → "${reminder.message}"`;
	}
	return `[${reminder.id}] ${reminder.type}${label}`;
}

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

export function createReminderTool(contactId: string, remindersPath: string): ToolDefinition {
	return {
		name: "reminder",
		label: "Reminder",
		description:
			"Manage scheduled reminders. Actions: create (schedule a new reminder), list (show your reminders), remove (delete a reminder by ID).",
		promptSnippet: "reminder — schedule reminders (one-time, recurring, cron expressions)",
		parameters: reminderParams,
		async execute(_toolCallId, params: ReminderParams) {
			const chat = getChatEntry(contactId, remindersPath);

			if (params.action === "list") {
				if (chat.reminders.length === 0) return textResult("No scheduled reminders.");
				return textResult(chat.reminders.map(formatReminder).join("\n"));
			}

			if (params.action === "remove") {
				if (!params.id) return textResult("Error: id is required for remove.");
				const reminder = chat.reminders.find((r) => r.id === params.id);
				if (!reminder) return textResult(`No reminder found with id "${params.id}".`);
				chat.reminders = chat.reminders.filter((r) => r.id !== params.id);
				saveRemindersFile(chat.remindersPath, chat.reminders);
				scheduleNext();
				return textResult(`Removed reminder ${params.id}.`);
			}

			if (params.action === "create") {
				if (!params.type) return textResult("Error: type is required (at, every, or cron).");
				if (!params.message) return textResult("Error: message is required.");

				if (params.type === "at") {
					if (!params.datetime) return textResult("Error: datetime is required for at reminders.");
					const dt = new Date(params.datetime);
					if (Number.isNaN(dt.getTime())) return textResult("Error: invalid datetime.");
					if (dt <= new Date()) return textResult("Error: datetime must be in the future.");
				}

				if (params.type === "every") {
					if (!params.intervalSeconds || params.intervalSeconds < 10)
						return textResult("Error: intervalSeconds must be at least 10.");
				}

				if (params.type === "cron") {
					if (!params.expression) return textResult("Error: expression is required for cron reminders.");
					try {
						new Cron(params.expression, { timezone: params.timezone });
					} catch (err) {
						return textResult(`Error: invalid cron expression — ${err}`);
					}
				}

				const reminder: Reminder = {
					id: genId(),
					type: params.type,
					message: params.message,
					label: params.label,
					datetime: params.datetime,
					intervalSeconds: params.intervalSeconds,
					expression: params.expression,
					timezone: params.timezone,
					createdAt: new Date().toISOString(),
				};
				chat.reminders.push(reminder);
				saveRemindersFile(chat.remindersPath, chat.reminders);
				scheduleNext();

				return textResult(`Created reminder: ${formatReminder(reminder)}`);
			}

			return textResult(`Unknown action: ${params.action}`);
		},
	};
}
