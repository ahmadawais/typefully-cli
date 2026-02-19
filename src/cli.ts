import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerAliasCommands } from './commands/aliases.js';
import { registerConfigCommand } from './commands/config.js';
import { registerDraftsCommand } from './commands/drafts.js';
import { registerMeCommand } from './commands/me.js';
import { registerMediaCommand } from './commands/media.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerSocialSetsCommand } from './commands/social-sets.js';
import { registerTagsCommand } from './commands/tags.js';
import { showBanner } from './utils/banner.js';
import { setJsonMode } from './utils/output.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export function createCli(): Command {
	const program = new Command();

	program
		.name('typefully')
		.description('Manage social media posts via the Typefully API')
		.version(pkg.version, '-v, --version')
		.option('-j, --json', 'Output raw JSON instead of human-readable text')
		.hook('preAction', (_thisCommand) => {
			const jsonMode = !!(program.opts() as { json?: boolean }).json;
			setJsonMode(jsonMode);
			const isVersion = process.argv.includes('-v') || process.argv.includes('--version');
			if (!isVersion && !jsonMode) {
				showBanner();
			}
		});

	registerSetupCommand(program);
	registerMeCommand(program);
	registerSocialSetsCommand(program);
	registerDraftsCommand(program);
	registerAliasCommands(program);
	registerTagsCommand(program);
	registerMediaCommand(program);
	registerConfigCommand(program);

	return program;
}
