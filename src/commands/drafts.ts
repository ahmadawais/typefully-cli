import fs from 'node:fs';
import type { Command } from 'commander';
import pc from 'picocolors';
import terminalLink from 'terminal-link';
import { PLATFORMS } from '../types.js';
import { apiRequest, display, spin } from '../utils/api.js';
import { getDefaultPlatforms, requireSocialSetId } from '../utils/config.js';
import {
	exitWithError,
	parseCsvArg,
	resolveDraftTarget,
	splitThreadText,
} from '../utils/helpers.js';

type DraftRaw = Record<string, unknown>;

function enabledPlatforms(draft: DraftRaw): string {
	if (!draft.platforms) return '';
	return Object.entries(draft.platforms as Record<string, { enabled?: boolean }>)
		.filter(([, v]) => v.enabled)
		.map(([k]) => k)
		.join(' · ');
}

export function firstPostText(draft: DraftRaw, maxLen = 80): string {
	// Top-level text field (list endpoint)
	if (draft.text) {
		const t = String(draft.text);
		return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
	}
	// Top-level posts array
	if (Array.isArray(draft.posts)) {
		const t = (draft.posts as { text?: string }[])[0]?.text;
		if (t) return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
	}
	// Nested platforms (single-draft response)
	if (draft.platforms) {
		for (const config of Object.values(
			draft.platforms as Record<string, { posts?: { text?: string }[] }>,
		)) {
			const t = config.posts?.[0]?.text;
			if (t) return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
		}
	}
	return '';
}

function statusBadge(status: string): string {
	switch (status) {
		case 'draft':
			return pc.dim('draft    ');
		case 'scheduled':
			return pc.cyan('scheduled');
		case 'published':
			return pc.green('published');
		case 'error':
			return pc.red('error    ');
		default:
			return pc.dim(status.padEnd(9));
	}
}

function renderDraftsList(data: DraftRaw): void {
	const results = (data.results ?? []) as DraftRaw[];
	if (results.length === 0) {
		console.log(pc.yellow('\n  No drafts found.\n'));
		return;
	}
	const total = data.total as number | undefined;
	const count = total ?? results.length;
	console.log('');
	console.log(pc.dim(`  ${count} draft${count !== 1 ? 's' : ''}`));
	console.log('');
	for (const draft of results) {
		const id = pc.dim(String(draft.id ?? '').slice(0, 8));
		const badge = statusBadge(String(draft.status ?? 'draft'));
		const platforms = enabledPlatforms(draft);
		const preview = firstPostText(draft);
		console.log(`  ${id}  ${badge}  ${pc.dim(platforms)}`);
		if (preview) console.log(`  ${pc.dim(preview)}`);
		console.log('');
	}
}

export function renderDraft(data: DraftRaw, verb?: string): void {
	const id = String(data.id ?? '');
	const status = String(data.status ?? 'draft');
	const platforms = enabledPlatforms(data);
	const preview = firstPostText(data);
	const prefix = verb ? `${pc.green('✓')} ${verb}  ` : '';

	const draftUrl = String(data.share_url ?? `https://typefully.com/?d=${id}`);
	const linkedId = terminalLink(pc.bold(id), draftUrl);

	console.log('');
	console.log(`  ${prefix}${linkedId}  ·  ${statusBadge(status)}  ·  ${pc.cyan(platforms)}`);
	if (preview) console.log(`  ${pc.dim(preview)}`);
	if (data.scheduled_at) {
		const date = new Date(String(data.scheduled_at)).toLocaleString();
		console.log(`  ${pc.dim('Scheduled:')} ${pc.yellow(date)}`);
	}
	if (data.share_url) console.log(`  ${pc.dim('Share:')} ${pc.cyan(String(data.share_url))}`);
	console.log('');
}

export async function getFirstConnectedPlatform(
	socialSetId: string | number,
): Promise<string | null> {
	const socialSet = (await apiRequest('GET', `/social-sets/${socialSetId}`)) as Record<
		string,
		unknown
	>;
	const platforms = (socialSet.platforms ?? {}) as Record<string, unknown>;
	for (const platform of PLATFORMS) {
		if (platforms[platform]) return platform;
	}
	return null;
}

export async function getAllConnectedPlatforms(
	socialSetId: string | number,
): Promise<readonly string[]> {
	const socialSet = (await apiRequest('GET', `/social-sets/${socialSetId}`)) as Record<
		string,
		unknown
	>;
	const platforms = (socialSet.platforms ?? {}) as Record<string, unknown>;
	const connected: string[] = [];
	for (const platform of PLATFORMS) {
		if (platforms[platform]) connected.push(platform);
	}
	return connected;
}

function resolveSocialSetId(socialSetId: string | undefined): string | number {
	return requireSocialSetId(socialSetId ?? null);
}

export function registerDraftsCommand(program: Command): void {
	const cmd = program.command('drafts').description('Manage drafts');

	cmd
		.command('list')
		.description('List drafts')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.option('--social-set-id <id>', 'Social set ID via flag (overrides positional)')
		.option('--status <status>', 'Filter by status: draft, scheduled, published, error')
		.option('--tag <tag>', 'Filter by tag slug')
		.option('--sort <order>', 'Sort order')
		.option('--limit <n>', 'Max results (default: 10)')
		.action(async (socialSetId: string | undefined, opts: Record<string, string>) => {
			const id = resolveSocialSetId((opts.socialSetId as string | undefined) ?? socialSetId);
			const params = new URLSearchParams();
			params.set('limit', opts.limit ?? '10');
			if (opts.status) params.set('status', opts.status);
			if (opts.tag) params.set('tag', opts.tag);
			if (opts.sort) params.set('order_by', opts.sort);
			const spinner = spin('Fetching drafts…');
			spinner.start();
			const data = await apiRequest('GET', `/social-sets/${id}/drafts?${params}`);
			spinner.stop();
			display(data, () => renderDraftsList(data as DraftRaw));
		});

	cmd
		.command('get')
		.description('Get a specific draft')
		.argument('[first_arg]', 'social_set_id or draft_id')
		.argument('[second_arg]', 'draft_id (when first arg is social_set_id)')
		.option('--social-set-id <id>', 'Social set ID via flag (first arg becomes draft_id)')
		.option('--use-default', 'Confirm using default social set')
		.action(
			async (
				firstArg: string | undefined,
				secondArg: string | undefined,
				opts: Record<string, unknown>,
			) => {
				const { socialSetId, draftId } = resolveDraftTarget(
					firstArg,
					secondArg,
					'drafts get',
					!!opts.useDefault,
					opts.socialSetId as string | undefined,
				);
				const spinner = spin('Fetching draft…');
				spinner.start();
				const data = await apiRequest('GET', `/social-sets/${socialSetId}/drafts/${draftId}`);
				spinner.stop();
				display(data, () => renderDraft(data as DraftRaw));
			},
		);

	cmd
		.command('create')
		.description('Create a new draft')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.option('--social-set-id <id>', 'Social set ID via flag (overrides positional)')
		.option('--text <text>', 'Post content (use --- on its own line for threads)')
		.option('-f, --file <path>', 'Read content from file')
		.option('--platform <platforms>', 'Comma-separated platforms')
		.option('--all', 'Post to all connected platforms')
		.option('--media <media_ids>', 'Comma-separated media IDs')
		.option('--title <title>', 'Draft title (internal only)')
		.option('--schedule <time>', '"now", "next-free-slot", or ISO datetime')
		.option('--tags <tags>', 'Comma-separated tag slugs')
		.option('--reply-to <url>', 'URL of X post to reply to')
		.option('--community <id>', 'X community ID')
		.option('--share', 'Generate a public share URL')
		.option('--scratchpad <text>', 'Internal notes/scratchpad')
		.option('--notes <text>', 'Internal notes/scratchpad (alias for --scratchpad)')
		.action(async (socialSetId: string | undefined, opts: Record<string, unknown>) => {
			const id = resolveSocialSetId((opts.socialSetId as string | undefined) ?? socialSetId);

			let text = opts.text as string | undefined;
			if (opts.file) {
				const filePath = opts.file as string;
				if (!fs.existsSync(filePath)) exitWithError(`File not found: ${filePath}`);
				text = fs.readFileSync(filePath, 'utf-8');
			}
			if (!text) exitWithError('--text or --file is required');

			if (opts.all && opts.platform) {
				exitWithError('Cannot use both --all and --platform flags');
			}

			let platformList: string[];
			if (opts.all) {
				const allPlatforms = await getAllConnectedPlatforms(id);
				if (allPlatforms.length === 0) exitWithError('No connected platforms found');
				platformList = [...allPlatforms];
			} else if (opts.platform) {
				platformList = (opts.platform as string).split(',').map((p) => p.trim());
			} else {
				const saved = getDefaultPlatforms();
				if (saved?.length) {
					const connected = await getAllConnectedPlatforms(id);
					platformList = saved.filter((p) => connected.includes(p));
					if (platformList.length === 0) platformList = [...connected];
				} else {
					const defaultPlatform = await getFirstConnectedPlatform(id);
					if (!defaultPlatform) exitWithError('No connected platforms found. Specify --platform');
					platformList = [defaultPlatform];
				}
			}

			const posts = splitThreadText(text);
			const mediaIds = opts.media ? (opts.media as string).split(',').map((m) => m.trim()) : [];

			const postsArray = posts.map((postText, index) => {
				const post: Record<string, unknown> = { text: postText };
				if (index === 0 && mediaIds.length > 0) post.media_ids = mediaIds;
				return post;
			});

			const platformsObj: Record<string, unknown> = {};
			for (const platform of platformList) {
				const platformConfig: Record<string, unknown> = { enabled: true, posts: postsArray };
				if (platform === 'x' && (opts.replyTo || opts.community)) {
					const settings: Record<string, unknown> = {};
					if (opts.replyTo) settings.reply_to_url = opts.replyTo;
					if (opts.community) settings.community_id = opts.community;
					platformConfig.settings = settings;
				}
				platformsObj[platform] = platformConfig;
			}

			const body: Record<string, unknown> = { platforms: platformsObj };
			if (opts.title) body.draft_title = opts.title;
			if (opts.schedule) body.publish_at = opts.schedule;
			if (opts.tags !== undefined) {
				body.tags = parseCsvArg(opts.tags, '--tags');
			}
			if (opts.share) body.share = true;
			const scratchpad = (opts.notes ?? opts.scratchpad) as string | undefined;
			if (scratchpad) body.scratchpad_text = scratchpad;

			const spinner = spin('Creating draft…');
			spinner.start();
			const data = await apiRequest('POST', `/social-sets/${id}/drafts`, body);
			spinner.stop();
			display(data, () => renderDraft(data as DraftRaw, 'Draft created'));
		});

	cmd
		.command('update')
		.description('Update an existing draft')
		.argument('[first_arg]', 'social_set_id or draft_id')
		.argument('[second_arg]', 'draft_id (when first arg is social_set_id)')
		.option('--social-set-id <id>', 'Social set ID via flag (first arg becomes draft_id)')
		.option('--text <text>', 'New post content')
		.option('-f, --file <path>', 'Read content from file')
		.option('--platform <platforms>', 'Comma-separated platforms')
		.option('--media <media_ids>', 'Comma-separated media IDs')
		.option('-a, --append', 'Append to existing thread')
		.option('--title <title>', 'New draft title')
		.option('--schedule <time>', '"now", "next-free-slot", or ISO datetime')
		.option('--tags <tags>', 'Comma-separated tag slugs')
		.option('--share', 'Generate a public share URL')
		.option('--scratchpad <text>', 'Internal notes/scratchpad')
		.option('--notes <text>', 'Internal notes/scratchpad (alias for --scratchpad)')
		.option('--use-default', 'Confirm using default social set')
		.action(
			async (
				firstArg: string | undefined,
				secondArg: string | undefined,
				opts: Record<string, unknown>,
			) => {
				const { socialSetId, draftId } = resolveDraftTarget(
					firstArg,
					secondArg,
					'drafts update',
					!!opts.useDefault,
					opts.socialSetId as string | undefined,
				);

				let text = opts.text as string | undefined;
				if (opts.file) {
					const filePath = opts.file as string;
					if (!fs.existsSync(filePath)) exitWithError(`File not found: ${filePath}`);
					text = fs.readFileSync(filePath, 'utf-8');
				}

				const body: Record<string, unknown> = {};

				if (text) {
					const mediaIds = opts.media ? (opts.media as string).split(',').map((m) => m.trim()) : [];

					const existing = (await apiRequest(
						'GET',
						`/social-sets/${socialSetId}/drafts/${draftId}`,
					)) as Record<string, unknown>;

					let platformList: string[];
					if (opts.platform) {
						platformList = (opts.platform as string).split(',').map((p) => p.trim());
					} else {
						const existingPlatforms = existing.platforms as
							| Record<string, Record<string, unknown>>
							| undefined;
						platformList = Object.entries(existingPlatforms ?? {})
							.filter(([, config]) => config.enabled)
							.map(([platform]) => platform);
						if (platformList.length === 0) {
							const defaultPlatform = await getFirstConnectedPlatform(socialSetId);
							if (!defaultPlatform) exitWithError('No connected platforms found');
							platformList = [defaultPlatform];
						}
					}

					let postsArray: Record<string, unknown>[];

					if (opts.append) {
						let existingPosts: readonly Record<string, unknown>[] = [];
						const existingPlatforms = existing.platforms as
							| Record<string, Record<string, unknown>>
							| undefined;
						for (const config of Object.values(existingPlatforms ?? {})) {
							if (config.enabled && config.posts) {
								existingPosts = config.posts as readonly Record<string, unknown>[];
								break;
							}
						}
						const newPost: Record<string, unknown> = { text };
						if (mediaIds.length > 0) newPost.media_ids = mediaIds;
						postsArray = [...existingPosts, newPost];
					} else {
						const posts = splitThreadText(text);
						postsArray = posts.map((postText, index) => {
							const post: Record<string, unknown> = { text: postText };
							if (index === 0 && mediaIds.length > 0) post.media_ids = mediaIds;
							return post;
						});
					}

					const platformsObj: Record<string, unknown> = {};
					for (const p of platformList) {
						platformsObj[p] = { enabled: true, posts: postsArray };
					}
					body.platforms = platformsObj;
				}

				if (opts.title) body.draft_title = opts.title;
				if (opts.schedule) body.publish_at = opts.schedule;
				if (opts.share) body.share = true;
				const scratchpad = (opts.notes ?? opts.scratchpad) as string | undefined;
				if (scratchpad) body.scratchpad_text = scratchpad;
				if (opts.tags !== undefined) {
					body.tags = parseCsvArg(opts.tags, '--tags');
				}

				if (Object.keys(body).length === 0) {
					exitWithError(
						'At least one option is required (--text, --file, --title, --schedule, --share, --scratchpad/--notes, or --tags)',
					);
				}

				const spinner = spin('Updating draft…');
				spinner.start();
				const data = await apiRequest(
					'PATCH',
					`/social-sets/${socialSetId}/drafts/${draftId}`,
					body,
				);
				spinner.stop();
				display(data, () => renderDraft(data as DraftRaw, 'Draft updated'));
			},
		);

	cmd
		.command('delete')
		.description('Delete a draft')
		.argument('[first_arg]', 'social_set_id or draft_id')
		.argument('[second_arg]', 'draft_id (when first arg is social_set_id)')
		.option('--social-set-id <id>', 'Social set ID via flag (first arg becomes draft_id)')
		.option('--use-default', 'Confirm using default social set')
		.action(
			async (
				firstArg: string | undefined,
				secondArg: string | undefined,
				opts: Record<string, unknown>,
			) => {
				const { socialSetId, draftId } = resolveDraftTarget(
					firstArg,
					secondArg,
					'drafts delete',
					!!opts.useDefault,
					opts.socialSetId as string | undefined,
				);
				const spinner = spin('Deleting draft…');
				spinner.start();
				await apiRequest('DELETE', `/social-sets/${socialSetId}/drafts/${draftId}`);
				spinner.succeed('Draft deleted');
				display({ success: true, message: 'Draft deleted' }, () => {});
			},
		);

	cmd
		.command('schedule')
		.description('Schedule a draft')
		.argument('[first_arg]', 'social_set_id or draft_id')
		.argument('[second_arg]', 'draft_id (when first arg is social_set_id)')
		.option('--social-set-id <id>', 'Social set ID via flag (first arg becomes draft_id)')
		.option('--time <time>', '"next-free-slot" or ISO datetime (required)')
		.option('--use-default', 'Confirm using default social set')
		.action(
			async (
				firstArg: string | undefined,
				secondArg: string | undefined,
				opts: Record<string, unknown>,
			) => {
				const { socialSetId, draftId } = resolveDraftTarget(
					firstArg,
					secondArg,
					'drafts schedule',
					!!opts.useDefault,
					opts.socialSetId as string | undefined,
				);
				if (!opts.time) exitWithError('--time is required (use "next-free-slot" or ISO datetime)');
				const spinner = spin('Scheduling draft…');
				spinner.start();
				const data = await apiRequest('PATCH', `/social-sets/${socialSetId}/drafts/${draftId}`, {
					publish_at: opts.time as string,
				});
				spinner.stop();
				display(data, () => renderDraft(data as DraftRaw, 'Draft scheduled'));
			},
		);

	cmd
		.command('publish')
		.description('Publish a draft immediately')
		.argument('[first_arg]', 'social_set_id or draft_id')
		.argument('[second_arg]', 'draft_id (when first arg is social_set_id)')
		.option('--social-set-id <id>', 'Social set ID via flag (first arg becomes draft_id)')
		.option('--use-default', 'Confirm using default social set')
		.action(
			async (
				firstArg: string | undefined,
				secondArg: string | undefined,
				opts: Record<string, unknown>,
			) => {
				const { socialSetId, draftId } = resolveDraftTarget(
					firstArg,
					secondArg,
					'drafts publish',
					!!opts.useDefault,
					opts.socialSetId as string | undefined,
				);
				const spinner = spin('Publishing draft…');
				spinner.start();
				const data = await apiRequest('PATCH', `/social-sets/${socialSetId}/drafts/${draftId}`, {
					publish_at: 'now',
				});
				spinner.stop();
				display(data, () => renderDraft(data as DraftRaw, 'Draft published'));
			},
		);
}
