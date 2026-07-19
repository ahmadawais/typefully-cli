import * as p from '@clack/prompts';
import { apiRequest, display, spin } from '../utils/api.js';
import { getDefaultPlatforms, requireSocialSetId } from '../utils/config.js';
import { exitWithError, splitThreadText } from '../utils/helpers.js';
import { getAllConnectedPlatforms, getFirstConnectedPlatform, renderDraft } from './drafts.js';

type DraftRaw = Record<string, unknown>;

/** Direct (non-interactive) draft creation - used when text is passed as a positional arg. */
async function createDraftDirect(text: string): Promise<void> {
	const id = requireSocialSetId(null);

	let platformList: string[];
	const saved = getDefaultPlatforms();
	if (saved?.length) {
		const connected = await getAllConnectedPlatforms(id);
		platformList = saved.filter((p) => connected.includes(p));
		if (platformList.length === 0) platformList = [...connected];
	} else {
		const platform = await getFirstConnectedPlatform(id);
		if (!platform) exitWithError('No connected platforms found. Run: typefully setup');
		platformList = [platform];
	}

	const posts = splitThreadText(text);
	const postsArray = posts.map((postText) => ({ text: postText }));
	const platformsObj: Record<string, unknown> = {};
	for (const p of platformList) platformsObj[p] = { enabled: true, posts: postsArray };
	const body = { platforms: platformsObj };

	const spinner = spin('Creating draft…');
	spinner.start();
	const data = await apiRequest('POST', `/social-sets/${id}/drafts`, body);
	spinner.stop();
	display(data, () => renderDraft(data as DraftRaw, 'Draft created'));
}

/** Interactive draft creation via clack - used when no text is provided. */
async function createDraftInteractive(): Promise<void> {
	const id = requireSocialSetId(null);

	const textResult = await p.text({
		message: 'What do you want to post?',
		placeholder: 'Your post content… (use --- on a new line to split into a thread)',
		validate: (value) => (!value?.trim() ? 'Post content is required.' : undefined),
	});
	if (p.isCancel(textResult)) {
		p.cancel('Cancelled.');
		process.exit(0);
	}
	const text = textResult as string;

	// Fetch connected platforms
	let availablePlatforms: readonly string[] = [];
	try {
		availablePlatforms = await getAllConnectedPlatforms(id);
	} catch {
		// silently fall through to single-platform fallback
	}

	const savedPlatforms = getDefaultPlatforms();
	const defaultInitial = savedPlatforms?.length
		? (availablePlatforms.filter((p) => savedPlatforms.includes(p as string)) as string[])
		: [availablePlatforms[0] as string];

	let platformList: string[];
	if (availablePlatforms.length > 1) {
		const selected = await p.multiselect({
			message: 'Post to',
			initialValues: defaultInitial.length ? defaultInitial : [availablePlatforms[0] as string],
			options: availablePlatforms.map((platform) => ({
				value: platform as string,
				label: platform as string,
			})),
		});
		if (p.isCancel(selected)) {
			p.cancel('Cancelled.');
			process.exit(0);
		}
		platformList = selected as string[];
	} else if (availablePlatforms.length === 1) {
		platformList = [availablePlatforms[0] as string];
	} else {
		const def = await getFirstConnectedPlatform(id);
		if (!def) {
			p.cancel('No connected platforms found. Run: typefully setup');
			process.exit(1);
		}
		platformList = [def];
	}

	const schedule = await p.select({
		message: 'When?',
		options: [
			{ value: 'draft', label: 'Save as draft' },
			{ value: 'next-free-slot', label: 'Schedule: next free slot' },
			{ value: 'now', label: 'Publish now' },
		],
	});
	if (p.isCancel(schedule)) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	const posts = splitThreadText(text);
	const postsArray = posts.map((postText) => ({ text: postText }));

	const platformsObj: Record<string, unknown> = {};
	for (const platform of platformList) {
		platformsObj[platform] = { enabled: true, posts: postsArray };
	}

	const body: Record<string, unknown> = { platforms: platformsObj };
	if (schedule !== 'draft') body.publish_at = schedule as string;

	const s = p.spinner();
	s.start('Creating draft…');
	const data = await apiRequest('POST', `/social-sets/${id}/drafts`, body);
	s.stop('');

	display(data, () => renderDraft(data as DraftRaw, 'Draft created'));
}

/**
 * Entry point for the default `tfly` / `typefully` command.
 * - With text: direct draft creation (no prompts)
 * - Without text: interactive clack flow
 */
export async function runDraft(text?: string): Promise<void> {
	if (text) {
		await createDraftDirect(text);
	} else {
		await createDraftInteractive();
	}
}
