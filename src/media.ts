// media.ts — Media storage cleanup and size checks

import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config, log } from "./config";

const DEFAULT_MAX_SIZE_MB = 50;
const DEFAULT_RETENTION_DAYS = 30;

export function getMaxSizeBytes(): number {
	return (config.mediaMaxSizeMb ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
}

export function checkMediaSize(sizeBytes: number): boolean {
	return sizeBytes <= getMaxSizeBytes();
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isExpired(mtimeMs: number, nowMs: number, retentionDays: number): boolean {
	const ageMs = nowMs - mtimeMs;
	return ageMs > retentionDays * 24 * 60 * 60 * 1000;
}

export function cleanupMedia(): void {
	const retentionDays = config.mediaRetentionDays ?? DEFAULT_RETENTION_DAYS;
	const workspaceDir = config.workspaceDir;

	let totalSize = 0;
	let totalFiles = 0;
	let deletedCount = 0;
	let deletedSize = 0;
	const now = Date.now();

	let contactDirs: string[];
	try {
		contactDirs = readdirSync(workspaceDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
	} catch {
		log("Media cleanup: no workspace directory yet");
		return;
	}

	for (const contactDir of contactDirs) {
		const mediaDir = join(workspaceDir, contactDir, "playground", "media");
		let files: string[];
		try {
			files = readdirSync(mediaDir);
		} catch {
			continue;
		}

		for (const file of files) {
			const filePath = join(mediaDir, file);
			let stat: ReturnType<typeof statSync>;
			try {
				stat = statSync(filePath);
			} catch {
				continue;
			}
			if (!stat.isFile()) continue;

			totalFiles++;
			totalSize += stat.size;

			if (isExpired(stat.mtimeMs, now, retentionDays)) {
				try {
					unlinkSync(filePath);
					deletedCount++;
					deletedSize += stat.size;
				} catch (err) {
					log(`Media cleanup: failed to delete ${filePath}: ${err}`);
				}
			}
		}
	}

	const kept = totalFiles - deletedCount;
	const keptSize = totalSize - deletedSize;
	log(
		`Media: ${kept} files (${formatSize(keptSize)}) on disk` +
			(deletedCount > 0 ? `, cleaned up ${deletedCount} expired files (${formatSize(deletedSize)})` : ""),
	);
}
