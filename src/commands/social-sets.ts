import type { Command } from 'commander';
import pc from 'picocolors';
import { apiRequest, display, spin } from '../utils/api.js';
import { requireSocialSetId } from '../utils/config.js';

type SocialSetRaw = Record<string, unknown>;
type PlatformCfg = Record<string, unknown>;

const PLATFORM_ORDER = ['x', 'linkedin', 'threads', 'bluesky', 'mastodon'] as const;

/** Format platform entries with their handle and connected state. */
function renderPlatforms(platforms: Record<string, PlatformCfg>, indent = '  '): void {
	for (const p of PLATFORM_ORDER) {
		const cfg = platforms[p];
		if (!cfg) continue;
		const isConnected = cfg.connected !== false;
		const dot = isConnected ? pc.green('●') : pc.dim('○');
		const handle = cfg.username ? pc.dim(` @${cfg.username}`) : '';
		const status = isConnected ? '' : pc.dim(' (not connected)');
		console.log(`${indent}${dot}  ${p.padEnd(9)}${handle}${status}`);
	}

	// Catch any unlisted platforms the API may return
	for (const [p, cfg] of Object.entries(platforms)) {
		if ((PLATFORM_ORDER as readonly string[]).includes(p)) continue;
		const isConnected = (cfg as PlatformCfg).connected !== false;
		const dot = isConnected ? pc.green('●') : pc.dim('○');
		const handle = (cfg as PlatformCfg).username
			? pc.dim(` @${(cfg as PlatformCfg).username}`)
			: '';
		console.log(`${indent}${dot}  ${p.padEnd(9)}${handle}`);
	}
}

function renderSocialSetCard(set: SocialSetRaw, index?: number): void {
	const team = set.team as Record<string, unknown> | null | undefined;
	const platforms = set.platforms as Record<string, PlatformCfg> | null | undefined;

	const prefix = index != null ? `${pc.dim(`${String(index + 1)}.`)} ` : '  ';
	const name = pc.bold(String(set.name ?? 'Unnamed'));
	const username = set.username ? pc.dim(` @${set.username}`) : '';
	const teamLabel = team ? pc.dim(` [${team.name}]`) : '';

	console.log(`${prefix}${name}${username}${teamLabel}`);
	console.log(
		pc.dim(`   ID: ${set.id}  ·  ${team ? `Team: ${team.name}${team.id ? ` (ID: ${team.id})` : ''}` : 'Personal'}`),
	);

	if (platforms && Object.keys(platforms).length > 0) {
		console.log('');
		renderPlatforms(platforms, '   ');
	}
}

function renderSocialSetsList(data: SocialSetRaw): void {
	const results = (data.results ?? []) as SocialSetRaw[];
	const total = (data.total as number | undefined) ?? results.length;

	if (results.length === 0) {
		console.log(pc.yellow('\n  No social sets found.'));
		console.log(pc.dim('  Connect a social account at typefully.com\n'));
		return;
	}

	console.log('');
	console.log(pc.dim(`  ${total} social set${total !== 1 ? 's' : ''}`));

	for (let i = 0; i < results.length; i++) {
		console.log('');
		renderSocialSetCard(results[i] as SocialSetRaw, i);
	}
	console.log('');
}

function renderSocialSet(data: SocialSetRaw): void {
	console.log('');
	renderSocialSetCard(data);
	console.log('');
}

export function registerSocialSetsCommand(program: Command): void {
	const cmd = program.command('social-sets').description('Manage social sets');

	cmd
		.command('list')
		.description('List all social sets')
		.action(async () => {
			const spinner = spin('Fetching social sets…');
			spinner.start();
			const data = await apiRequest('GET', '/social-sets?limit=50');
			spinner.stop();
			display(data, () => renderSocialSetsList(data as SocialSetRaw));
		});

	cmd
		.command('get')
		.description('Get social set details')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.action(async (socialSetId?: string) => {
			const id = requireSocialSetId(socialSetId ?? null);
			const spinner = spin('Fetching social set…');
			spinner.start();
			const data = await apiRequest('GET', `/social-sets/${id}`);
			spinner.stop();
			display(data, () => renderSocialSet(data as SocialSetRaw));
		});
}
