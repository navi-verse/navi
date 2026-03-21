import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { appendFile, writeFile } from "fs/promises";
import { join } from "path";

export interface Attachment {
	original: string;
	local: string;
}

export interface LoggedMessage {
	date: string;
	ts: string;
	user: string;
	userName?: string;
	displayName?: string;
	text: string;
	attachments: Attachment[];
	isBot: boolean;
}

export interface ChatStoreConfig {
	workingDir: string;
}

export class ChatStore {
	private workingDir: string;
	private recentlyLogged = new Map<string, number>();

	constructor(config: ChatStoreConfig) {
		this.workingDir = config.workingDir;

		if (!existsSync(this.workingDir)) {
			mkdirSync(this.workingDir, { recursive: true });
		}
	}

	getChatDir(chatId: string): string {
		const dir = join(this.workingDir, chatId);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	generateLocalFilename(originalName: string, timestamp: string): string {
		const ts = Math.floor(Number.parseFloat(timestamp) * 1000);
		const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
		return `${ts}_${sanitized}`;
	}

	/**
	 * Save a media attachment to disk
	 */
	async saveAttachment(chatId: string, fileName: string, data: Buffer, timestamp: string): Promise<Attachment> {
		const localFilename = this.generateLocalFilename(fileName, timestamp);
		const localPath = `${chatId}/attachments/${localFilename}`;
		const fullPath = join(this.workingDir, localPath);

		const dir = join(this.workingDir, chatId, "attachments");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		await writeFile(fullPath, data);

		return {
			original: fileName,
			local: localPath,
		};
	}

	async logMessage(chatId: string, message: LoggedMessage): Promise<boolean> {
		const dedupeKey = `${chatId}:${message.ts}`;
		if (this.recentlyLogged.has(dedupeKey)) {
			return false;
		}

		this.recentlyLogged.set(dedupeKey, Date.now());
		setTimeout(() => this.recentlyLogged.delete(dedupeKey), 60000);

		const logPath = join(this.getChatDir(chatId), "log.jsonl");

		if (!message.date) {
			let date: Date;
			if (message.ts.includes(".")) {
				date = new Date(Number.parseFloat(message.ts) * 1000);
			} else {
				date = new Date(Number.parseInt(message.ts, 10));
			}
			message.date = date.toISOString();
		}

		const line = `${JSON.stringify(message)}\n`;
		await appendFile(logPath, line, "utf-8");
		return true;
	}

	async logBotResponse(chatId: string, text: string, ts: string): Promise<void> {
		await this.logMessage(chatId, {
			date: new Date().toISOString(),
			ts,
			user: "bot",
			text,
			attachments: [],
			isBot: true,
		});
	}

	getLastTimestamp(chatId: string): string | null {
		const logPath = join(this.workingDir, chatId, "log.jsonl");
		if (!existsSync(logPath)) {
			return null;
		}

		try {
			const content = readFileSync(logPath, "utf-8");
			const lines = content.trim().split("\n");
			if (lines.length === 0 || lines[0] === "") {
				return null;
			}
			const lastLine = lines[lines.length - 1];
			const message = JSON.parse(lastLine) as LoggedMessage;
			return message.ts;
		} catch {
			return null;
		}
	}

	/**
	 * Log to file synchronously (used by whatsapp.ts for immediate logging)
	 */
	logToFileSync(chatId: string, entry: object): void {
		const dir = join(this.workingDir, chatId);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify(entry)}\n`);
	}
}
