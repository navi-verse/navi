// cron.ts — Job scheduler: at/every/cron with JSON persistence and agent tool

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { Cron } from "croner";
import { dataDir } from "./config";

// ── Types ────────────────────────────────────────────

interface CronJob {
	id: string;
	contactId: string;
	type: "at" | "every" | "cron";
	message: string;
	label?: string;
	datetime?: string; // ISO 8601 for "at"
	intervalSeconds?: number; // for "every"
	expression?: string; // cron expr for "cron"
	timezone?: string; // IANA timezone for "cron"
	createdAt: string;
}

type FireCallback = (contactId: string, message: string) => Promise<void>;

// ── Persistence ──────────────────────────────────────

const jobsPath = join(dataDir, "jobs.json");

function loadJobs(): CronJob[] {
	if (!existsSync(jobsPath)) return [];
	try {
		return JSON.parse(readFileSync(jobsPath, "utf-8"));
	} catch {
		return [];
	}
}

function saveJobs() {
	writeFileSync(jobsPath, `${JSON.stringify(jobs, null, "\t")}\n`);
}

// ── Scheduler ────────────────────────────────────────

let jobs: CronJob[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let fireCallback: FireCallback | null = null;

function genId(): string {
	return randomBytes(4).toString("hex");
}

function getNextFireTime(job: CronJob): Date | null {
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

	if (jobs.length === 0) return;

	let earliest: { job: CronJob; time: Date } | null = null;

	for (const job of jobs) {
		const next = getNextFireTime(job);
		if (next && (!earliest || next < earliest.time)) {
			earliest = { job, time: next };
		}
	}

	if (!earliest) return;

	const MAX_DELAY = 2_147_483_647; // 2^31 - 1, setTimeout overflows beyond this
	const delay = Math.min(MAX_DELAY, Math.max(0, earliest.time.getTime() - Date.now()));
	const { job } = earliest;

	timer = setTimeout(async () => {
		timer = null;
		console.log(`⏰ Cron firing: [${job.id}] ${job.label || job.message.substring(0, 40)}`);

		if (fireCallback) {
			try {
				await fireCallback(job.contactId, job.message);
			} catch (err) {
				console.error(`Cron fire error [${job.id}]:`, err);
			}
		}

		// Remove one-shot jobs
		if (job.type === "at") {
			jobs = jobs.filter((j) => j.id !== job.id);
			saveJobs();
		}

		scheduleNext();
	}, delay);
}

// ── Public API ───────────────────────────────────────

export function startCron(callback: FireCallback) {
	fireCallback = callback;
	jobs = loadJobs();
	// Purge expired one-shot jobs (e.g. process was down when they should have fired)
	const before = jobs.length;
	jobs = jobs.filter((j) => !(j.type === "at" && j.datetime && new Date(j.datetime) <= new Date()));
	if (jobs.length < before) saveJobs();
	console.log(`⏰ Cron started with ${jobs.length} job(s)`);
	scheduleNext();
}

function addJob(job: CronJob): CronJob {
	jobs.push(job);
	saveJobs();
	scheduleNext();
	return job;
}

function removeJob(id: string): boolean {
	const before = jobs.length;
	jobs = jobs.filter((j) => j.id !== id);
	if (jobs.length === before) return false;
	saveJobs();
	scheduleNext();
	return true;
}

function listJobs(contactId: string): CronJob[] {
	return jobs.filter((j) => j.contactId === contactId);
}

// ── Tool ─────────────────────────────────────────────

const cronParams = Type.Object({
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

type CronParams = Static<typeof cronParams>;

function formatJob(job: CronJob): string {
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

export function createCronTool(contactId: string): ToolDefinition {
	return {
		name: "cron",
		label: "Cron",
		description:
			"Manage scheduled jobs. Actions: create (schedule a new job), list (show your jobs), remove (delete a job by ID).",
		promptSnippet: "cron — schedule jobs (reminders, recurring tasks, cron expressions)",
		parameters: cronParams,
		async execute(_toolCallId, params: CronParams) {
			if (params.action === "list") {
				const mine = listJobs(contactId);
				if (mine.length === 0) return textResult("No scheduled jobs.");
				return textResult(mine.map(formatJob).join("\n"));
			}

			if (params.action === "remove") {
				if (!params.id) return textResult("Error: id is required for remove.");
				// Only allow removing own jobs
				const job = jobs.find((j) => j.id === params.id && j.contactId === contactId);
				if (!job) return textResult(`No job found with id "${params.id}".`);
				removeJob(params.id);
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

				const job = addJob({
					id: genId(),
					contactId,
					type: params.type,
					message: params.message,
					label: params.label,
					datetime: params.datetime,
					intervalSeconds: params.intervalSeconds,
					expression: params.expression,
					timezone: params.timezone,
					createdAt: new Date().toISOString(),
				});

				return textResult(`Created job: ${formatJob(job)}`);
			}

			return textResult(`Unknown action: ${params.action}`);
		},
	};
}
