import type { Command } from 'commander';
import pc from 'picocolors';
import { apiRequest, display, spin } from '../utils/api.js';
import { requireSocialSetId } from '../utils/config.js';
import { exitWithError } from '../utils/helpers.js';

function renderTagsList(data: Record<string, unknown>): void {
	const results = (data.results ?? []) as Record<string, unknown>[];
	if (results.length === 0) {
		console.log(pc.yellow('\n  No tags found.\n'));
		return;
	}
	console.log('');
	console.log(pc.dim(`  ${results.length} tag${results.length !== 1 ? 's' : ''}`));
	console.log('');
	for (let i = 0; i < results.length; i++) {
		const tag = results[i] as Record<string, unknown>;
		const num = pc.dim(`${String(i + 1)}.`.padStart(3));
		const name = pc.bold(String(tag.name ?? ''));
		const slug = tag.slug ? pc.dim(` (${tag.slug})`) : '';
		console.log(`  ${num} ${name}${slug}`);
	}
	console.log('');
}

export function registerTagsCommand(program: Command): void {
	const cmd = program.command('tags').description('Manage tags');

	cmd
		.command('list')
		.description('List all tags')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.action(async (socialSetId?: string) => {
			const id = requireSocialSetId(socialSetId ?? null);
			const spinner = spin('Fetching tags…');
			spinner.start();
			const data = await apiRequest('GET', `/social-sets/${id}/tags?limit=50`);
			spinner.stop();
			display(data, () => renderTagsList(data as Record<string, unknown>));
		});

	cmd
		.command('create')
		.description('Create a new tag')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.option('--name <name>', 'Tag name (required)')
		.action(async (socialSetId: string | undefined, opts: Record<string, string>) => {
			const id = requireSocialSetId(socialSetId ?? null);
			if (!opts.name) exitWithError('--name is required');
			const spinner = spin('Creating tag…');
			spinner.start();
			const data = await apiRequest('POST', `/social-sets/${id}/tags`, { name: opts.name });
			spinner.stop();
			display(data, () => {
				const tag = data as Record<string, unknown>;
				console.log('');
				console.log(`  ${pc.green('✓')} Tag created: ${pc.bold(String(tag.name ?? opts.name))}`);
				if (tag.slug) console.log(pc.dim(`  Slug: ${tag.slug}`));
				console.log('');
			});
		});
}
