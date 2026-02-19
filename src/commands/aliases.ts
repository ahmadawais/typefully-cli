import fs from 'node:fs';
import type { Command } from 'commander';
import { apiRequest, display, spin } from '../utils/api.js';
import { requireSocialSetId } from '../utils/config.js';
import { exitWithError, parseCsvArg, splitThreadText } from '../utils/helpers.js';
import { getAllConnectedPlatforms, getFirstConnectedPlatform, renderDraft } from './drafts.js';

type DraftRaw = Record<string, unknown>;

export function registerAliasCommands(program: Command): void {
	// create-draft: top-level alias for drafts create with positional text
	program
		.command('create-draft')
		.description('Create a draft — alias for "drafts create" with positional text')
		.argument('[text]', 'Draft text (or use --text/--file)')
		.option('--social-set-id <id>', 'Social set ID (uses default if omitted)')
		.option('--text <text>', 'Post content (overrides positional text)')
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
		.action(async (positionalText: string | undefined, opts: Record<string, unknown>) => {
			const id = requireSocialSetId((opts.socialSetId as string | undefined) ?? null);

			let text: string | undefined;
			if (opts.file) {
				const filePath = opts.file as string;
				if (!fs.existsSync(filePath)) exitWithError(`File not found: ${filePath}`);
				text = fs.readFileSync(filePath, 'utf-8');
			} else {
				text = (opts.text as string | undefined) ?? positionalText;
			}
			if (!text)
				exitWithError('Draft text is required (provide as argument, or use --text/--file)');

			if (opts.all && opts.platform) exitWithError('Cannot use both --all and --platform flags');

			let platformList: string[];
			if (opts.all) {
				const allPlatforms = await getAllConnectedPlatforms(id);
				if (allPlatforms.length === 0) exitWithError('No connected platforms found');
				platformList = [...allPlatforms];
			} else if (opts.platform) {
				platformList = (opts.platform as string).split(',').map((p) => p.trim());
			} else {
				const defaultPlatform = await getFirstConnectedPlatform(id);
				if (!defaultPlatform) exitWithError('No connected platforms found. Specify --platform');
				platformList = [defaultPlatform];
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
			if (opts.tags !== undefined) body.tags = parseCsvArg(opts.tags, '--tags');
			if (opts.share) body.share = true;
			const scratchpad = (opts.notes ?? opts.scratchpad) as string | undefined;
			if (scratchpad) body.scratchpad_text = scratchpad;

			const spinner = spin('Creating draft…');
			spinner.start();
			const data = await apiRequest('POST', `/social-sets/${id}/drafts`, body);
			spinner.stop();
			display(data, () => renderDraft(data as DraftRaw, 'Draft created'));
		});

	// update-draft: top-level alias for drafts update with positional draft_id
	program
		.command('update-draft')
		.description('Update a draft — alias for "drafts update" with positional draft_id')
		.argument('<draft_id>', 'Draft ID')
		.argument('[text]', 'New draft text (or use --text/--file)')
		.option('--social-set-id <id>', 'Social set ID (uses default if omitted)')
		.option('--text <text>', 'New post content (overrides positional text)')
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
		.action(
			async (
				draftId: string,
				positionalText: string | undefined,
				opts: Record<string, unknown>,
			) => {
				const socialSetId = requireSocialSetId((opts.socialSetId as string | undefined) ?? null);

				let text: string | undefined;
				if (opts.file) {
					const filePath = opts.file as string;
					if (!fs.existsSync(filePath)) exitWithError(`File not found: ${filePath}`);
					text = fs.readFileSync(filePath, 'utf-8');
				} else {
					text = (opts.text as string | undefined) ?? positionalText;
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
				if (opts.tags !== undefined) body.tags = parseCsvArg(opts.tags, '--tags');

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
}
