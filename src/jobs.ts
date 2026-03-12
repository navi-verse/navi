// jobs.ts — Job scheduler: at/every/cron with per-chat JSON persistence and agent tool

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { Cron } from "croner";
import { config, contactIdFromDirName, log, logError } from "./config";

// ── Types ────────────────────────────────────────────

interface Job {
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

interface ChatJobs {
	contactId: string;
	jobsPath: string;
	jobs: Job[];
}

type FireCallback = (contactId: string, message: string) => Promise<void>;

// ── Persistence ──────────────────────────────────────

function loadJobsFile(jobsPath: string): Job[] {
	if (!existsSync(jobsPath)) return [];
	try {
		return JSON.parse(readFileSync(jobsPath, "utf-8"));
	} catch {
		return [];
	}
}

function saveJobsFile(jobsPath: string, jobs: Job[]) {
	if (jobs.length === 0) {
		if (existsSync(jobsPath)) unlinkSync(jobsPath);
		return;
	}
	writeFileSync(jobsPath, `${JSON.stringify(jobs, null, "\t")}\n`);
}

// ── Scheduler ────────────────────────────────────────

const allChats: ChatJobs[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let fireCallback: FireCallback | null = null;

function genId(): string {
	return randomBytes(4).toString("hex");
}

function getNextFireTime(job: Job): Date | null {
	const now = new Date();

	if (job.type === "at" && job.datetime) {
		const dt = new Date(job.datetime);
		return dt > now ? dt : null;
	}

	if (job.type === "every" && job.intervalSeconds) {
		const created = new Date(job.createdAt);
		const elapsed = now.getTime() - created.getTime();
		const intervalMs = job.intervalSeconds * 1000;
		const periods = Math.floor(elapsed / intervalMs);
		const next = new Date(created.getTime() + (periods + 1) * intervalMs);
		return next;
	}

	if (job.type === "cron" && job.expression) {
		const cron = new Cron(job.expression, { timezone: job.timezone });
		return cron.nextRun() ?? null;
	}

	return null;
}

function scheduleNext() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}

	let earliest: { chat: ChatJobs; job: Job; time: Date } | null = null;

	for (const chat of allChats) {
		for (const job of chat.jobs) {
			const next = getNextFireTime(job);
			if (next && (!earliest || next < earliest.time)) {
				earliest = { chat, job, time: next };
			}
		}
	}

	if (!earliest) return;

	const MAX_DELAY = 2_147_483_647;
	const delay = Math.min(MAX_DELAY, Math.max(0, earliest.time.getTime() - Date.now()));
	const { chat, job } = earliest;

	timer = setTimeout(async () => {
		timer = null;

		try {
			log(`⏰ ${chat.contactId}: job fired [${job.id}] ${job.label || job.message.substring(0, 40)}`);

			if (fireCallback) {
				await fireCallback(chat.contactId, job.message);
			}

			if (job.type === "at") {
				chat.jobs = chat.jobs.filter((r) => r.id !== job.id);
				saveJobsFile(chat.jobsPath, chat.jobs);
			}
		} catch (err) {
			logError(`⏰ ${chat.contactId}: job error [${job.id}]`, err);
		}

		scheduleNext();
	}, delay);
}

// ── Public API ───────────────────────────────────────

function getChatEntry(contactId: string, jobsPath: string): ChatJobs {
	let chat = allChats.find((c) => c.contactId === contactId);
	if (!chat) {
		chat = { contactId, jobsPath, jobs: loadJobsFile(jobsPath) };
		allChats.push(chat);
	}
	return chat;
}

export function startJobs(callback: FireCallback) {
	fireCallback = callback;

	if (existsSync(config.chatsDir)) {
		for (const entry of readdirSync(config.chatsDir)) {
			const entryPath = join(config.chatsDir, entry);
			if (!statSync(entryPath).isDirectory()) continue;

			const jobsPath = join(entryPath, "jobs.json");
			if (!existsSync(jobsPath)) continue;

			const contactId = contactIdFromDirName(entry);
			const chat = getChatEntry(contactId, jobsPath);

			// Purge expired one-shot jobs
			const before = chat.jobs.length;
			chat.jobs = chat.jobs.filter((r) => !(r.type === "at" && r.datetime && new Date(r.datetime) <= new Date()));
			if (chat.jobs.length < before) saveJobsFile(chat.jobsPath, chat.jobs);
		}
	}

	const totalJobs = allChats.reduce((sum, c) => sum + c.jobs.length, 0);
	log(`⏰ Jobs: ${totalJobs} job(s) across ${allChats.length} chat(s)`);
	scheduleNext();
}

// ── Tool ─────────────────────────────────────────────

const jobParams = Type.Object({
	action: Type.Union([Type.Literal("create"), Type.Literal("list"), Type.Literal("remove")]),
	type: Type.Optional(Type.Union([Type.Literal("at"), Type.Literal("every"), Type.Literal("cron")])),
	message: Type.Optional(Type.String()),
	label: Type.Optional(Type.String()),
	datetime: Type.Optional(Type.String({ description: "ISO 8601 datetime for at jobs" })),
	intervalSeconds: Type.Optional(Type.Number({ description: "Interval in seconds for every jobs" })),
	expression: Type.Optional(Type.String({ description: "Cron expression for cron jobs" })),
	timezone: Type.Optional(Type.String({ description: "IANA timezone for cron jobs" })),
	id: Type.Optional(Type.String({ description: "Job ID for remove action" })),
});

type JobParams = Static<typeof jobParams>;

function formatJob(job: Job): string {
	const next = getNextFireTime(job);
	const nextStr = next ? next.toISOString() : "none";
	const label = job.label ? ` (${job.label})` : "";

	if (job.type === "at") return `[${job.id}] at ${job.datetime}${label} → "${job.message}"`;
	if (job.type === "every")
		return `[${job.id}] every ${job.intervalSeconds}s${label} next=${nextStr} → "${job.message}"`;
	if (job.type === "cron") {
		const tz = job.timezone ? ` (${job.timezone})` : "";
		return `[${job.id}] cron ${job.expression}${tz}${label} next=${nextStr} → "${job.message}"`;
	}
	return `[${job.id}] ${job.type}${label}`;
}

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

export function createJobTool(contactId: string, jobsPath: string): ToolDefinition {
	return {
		name: "job",
		label: "Job",
		description:
			"Manage scheduled jobs. Actions: create (schedule a new job), list (show your jobs), remove (delete a job by ID).",
		promptSnippet: "job — schedule jobs (one-time, recurring, cron expressions)",
		parameters: jobParams,
		async execute(_toolCallId, params: JobParams) {
			const chat = getChatEntry(contactId, jobsPath);

			if (params.action === "list") {
				if (chat.jobs.length === 0) return textResult("No scheduled jobs.");
				return textResult(chat.jobs.map(formatJob).join("\n"));
			}

			if (params.action === "remove") {
				if (!params.id) return textResult("Error: id is required for remove.");
				const job = chat.jobs.find((r) => r.id === params.id);
				if (!job) return textResult(`No job found with id "${params.id}".`);
				chat.jobs = chat.jobs.filter((r) => r.id !== params.id);
				saveJobsFile(chat.jobsPath, chat.jobs);
				scheduleNext();
				return textResult(`Removed job ${params.id}.`);
			}

			if (params.action === "create") {
				if (!params.type) return textResult("Error: type is required (at, every, or cron).");
				if (!params.message) return textResult("Error: message is required.");

				if (params.type === "at") {
					if (!params.datetime) return textResult("Error: datetime is required for at jobs.");
					const dt = new Date(params.datetime);
					if (Number.isNaN(dt.getTime())) return textResult("Error: invalid datetime.");
					if (dt <= new Date()) return textResult("Error: datetime must be in the future.");
				}

				if (params.type === "every") {
					if (!params.intervalSeconds || params.intervalSeconds < 10)
						return textResult("Error: intervalSeconds must be at least 10.");
				}

				if (params.type === "cron") {
					if (!params.expression) return textResult("Error: expression is required for cron jobs.");
					try {
						new Cron(params.expression, { timezone: params.timezone });
					} catch (err) {
						return textResult(`Error: invalid cron expression — ${err}`);
					}
				}

				const job: Job = {
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
				chat.jobs.push(job);
				saveJobsFile(chat.jobsPath, chat.jobs);
				scheduleNext();

				return textResult(`Created job: ${formatJob(job)}`);
			}

			return textResult(`Unknown action: ${params.action}`);
		},
	};
}
