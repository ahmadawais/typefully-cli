import path from 'node:path';
import pc from 'picocolors';
import { CONTENT_TYPES } from '../types.js';
import { output } from './api.js';
import { getDefaultSocialSetId } from './config.js';

export function splitThreadText(text: string): readonly string[] {
	return text.split(/\r?\n[ \t]*---[ \t]*\r?\n/).filter((t) => t.trim());
}

export function sanitizeFilename(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	const basename = path.basename(filename, path.extname(filename));
	const sanitized = basename
		.replace(/[^a-zA-Z0-9_.()-]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
	return `${sanitized || 'upload'}${ext}`;
}

export function getContentType(filename: string): string {
	const ext = path.extname(filename).slice(1).toLowerCase();
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function parseCsvArg(value: unknown, flagName: string): readonly string[] | null {
	if (value === true) {
		exitWithError(`${flagName} requires a value`);
	}
	if (value == null) return null;
	if (typeof value !== 'string') {
		exitWithError(`${flagName} must be a string`);
	}
	if (value.trim() === '') return [];
	return value
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
}

export function exitWithError(message: string, details?: Record<string, unknown>): never {
	output({ error: message, ...details });
	process.exit(1);
}

export interface DraftTarget {
	readonly socialSetId: string | number;
	readonly draftId: string;
}

export function resolveDraftTarget(
	firstArg: string | undefined,
	secondArg: string | undefined,
	commandName: string,
	useDefault: boolean,
	socialSetIdFlag?: string,
): DraftTarget {
	// Flag takes priority — first positional is the draft_id
	if (socialSetIdFlag) {
		if (!firstArg) exitWithError('draft_id is required');
		return { socialSetId: socialSetIdFlag, draftId: firstArg };
	}

	// Two positional args — no ambiguity
	if (firstArg && secondArg) {
		return { socialSetId: firstArg, draftId: secondArg };
	}

	// No args at all
	if (!firstArg && !secondArg) {
		exitWithError('draft_id is required');
	}

	// Single arg — could be draft_id with default social set
	const singleArg = (firstArg || secondArg) as string;
	const defaultResult = getDefaultSocialSetId();

	if (!defaultResult) {
		exitWithError('draft_id is required', {
			hint: 'Provide both social_set_id and draft_id, or set a default: typefully config set-default',
		});
	}

	if (!useDefault) {
		exitWithError(`Ambiguous arguments for ${commandName}`, {
			hint: `Add --use-default to confirm using default social set (${defaultResult.id}), or provide both arguments.`,
		});
	}

	return { socialSetId: defaultResult.id, draftId: singleArg };
}

export function formatSocialSetsForDisplay(
	socialSets: readonly Record<string, unknown>[],
): readonly {
	readonly set: Record<string, unknown>;
	readonly displayLine: string;
	readonly index: number;
}[] {
	const personal = socialSets.filter((s) => !s.team);
	const team = socialSets.filter((s) => s.team);

	const teamObj = team as readonly Record<string, unknown>[];
	const sorted = [
		...personal,
		...teamObj.slice().sort((a, b) => {
			const aTeam = a.team as Record<string, unknown> | undefined;
			const bTeam = b.team as Record<string, unknown> | undefined;
			return ((aTeam?.name as string) || '').localeCompare((bTeam?.name as string) || '');
		}),
	];

	return sorted.map((set, index) => {
		const num = pc.yellow(`${index + 1}.`.padStart(3));
		const name = pc.bold(String(set.name || 'Unnamed'));
		const username = set.username ? pc.dim(` @${set.username}`) : '';
		const teamLabel = set.team
			? pc.dim(` [${(set.team as Record<string, unknown>)?.name ?? ''}]`)
			: '';
		const displayLine = `  ${num} ${name}${username}${teamLabel}`;
		return { set, displayLine, index: index + 1 };
	});
}
