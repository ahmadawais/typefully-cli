import fs from 'node:fs';
import path from 'node:path';
import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';
import { apiRequest, output } from '../utils/api.js';
import {
	API_KEY_URL,
	getGlobalConfigFile,
	getLocalConfigFile,
	readConfigFile,
	writeConfig,
} from '../utils/config.js';
import { exitWithError, formatSocialSetsForDisplay } from '../utils/helpers.js';

export function registerSetupCommand(program: Command): void {
	program
		.command('setup')
		.description('Interactive setup — saves API key and optional default social set')
		.option('--key <api_key>', 'Provide key non-interactively')
		.option('--location <location>', 'Config location: global or local')
		.option('--scope <scope>', 'Alias for --location: global or local')
		.option('--default-social-set <id>', 'Set default social set non-interactively')
		.option('--no-default', 'Skip setting default social set')
		.action(async (opts: Record<string, unknown>) => {
			let apiKey = opts.key as string | undefined;
			let location = (opts.scope ?? opts.location) as string | undefined;
			const defaultSocialSetArg = opts.defaultSocialSet as string | undefined;
			const noDefault = opts.default === false;
			const isNonInteractive = !!apiKey;

			if (!apiKey) {
				clack.intro(pc.bold('Typefully CLI Setup'));
				console.error(pc.dim("Sign up free at typefully.com if you don't have an account."));
				console.error(`${pc.blue('→')} Get your API key at: ${pc.cyan(API_KEY_URL)}`);

				const keyInput = await clack.text({
					message: 'Enter your Typefully API key',
					validate: (val = '') => {
						if (!val.trim()) return 'API key is required';
					},
				});
				if (clack.isCancel(keyInput)) process.exit(0);
				apiKey = keyInput;
			}

			if (!apiKey) exitWithError('API key is required');

			if (!location) {
				if (isNonInteractive) {
					location = 'global';
				} else {
					const locationChoice = await clack.select({
						message: 'Where should the API key be stored?',
						options: [
							{
								value: 'global',
								label: `Global ${pc.dim('(~/.config/typefully/)')} — Available to all projects`,
							},
							{ value: 'local', label: `Local ${pc.dim('(./.typefully/)')} — Only this project` },
						],
					});
					if (clack.isCancel(locationChoice)) process.exit(0);
					location = locationChoice as string;
				}
			}

			const isLocal = location === 'local' || location === '2';
			const configPath = isLocal ? getLocalConfigFile() : getGlobalConfigFile();
			const existingConfig = readConfigFile(configPath) ?? {};
			writeConfig(configPath, { ...existingConfig, apiKey });

			// Handle .gitignore for local config
			if (isLocal) {
				const gitignorePath = path.join(process.cwd(), '.gitignore');
				if (fs.existsSync(gitignorePath)) {
					const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
					if (!gitignore.includes('.typefully/') && !gitignore.includes('.typefully\n')) {
						if (isNonInteractive) {
							fs.appendFileSync(
								gitignorePath,
								'\n# Typefully config (contains API key)\n.typefully/\n',
							);
							console.error(pc.green('✓ Added .typefully/ to .gitignore'));
						} else {
							const addToGitignore = await clack.confirm({
								message: 'Add .typefully/ to .gitignore?',
								initialValue: true,
							});
							if (!clack.isCancel(addToGitignore) && addToGitignore) {
								fs.appendFileSync(
									gitignorePath,
									'\n# Typefully config (contains API key)\n.typefully/\n',
								);
								console.error(pc.green('✓ Added .typefully/ to .gitignore'));
							}
						}
					}
				} else if (isNonInteractive) {
					fs.writeFileSync(gitignorePath, '# Typefully config (contains API key)\n.typefully/\n');
					console.error(pc.green('✓ Created .gitignore with .typefully/ entry'));
				} else {
					console.error(
						pc.yellow('⚠ No .gitignore found. Your API key could be accidentally committed.'),
					);
					const createGitignore = await clack.confirm({
						message: 'Create .gitignore with .typefully/ entry?',
						initialValue: true,
					});
					if (!clack.isCancel(createGitignore) && createGitignore) {
						fs.writeFileSync(gitignorePath, '# Typefully config (contains API key)\n.typefully/\n');
						console.error(pc.green('✓ Created .gitignore with .typefully/ entry'));
					}
				}
			}

			console.error(pc.green(`✓ API key saved to ${pc.dim(configPath)}`));

			// Handle default social set
			let defaultSocialSetId: string | number | null = null;

			if (defaultSocialSetArg) {
				const origKey = process.env.TYPEFULLY_API_KEY;
				process.env.TYPEFULLY_API_KEY = apiKey;
				try {
					await apiRequest('GET', `/social-sets/${defaultSocialSetArg}`, null, {
						exitOnError: false,
					});
				} catch {
					if (origKey) process.env.TYPEFULLY_API_KEY = origKey;
					else delete process.env.TYPEFULLY_API_KEY;
					exitWithError(`Social set ${defaultSocialSetArg} not found or not accessible`);
				}
				if (origKey) process.env.TYPEFULLY_API_KEY = origKey;
				else delete process.env.TYPEFULLY_API_KEY;

				defaultSocialSetId = defaultSocialSetArg;
				const updatedConfig = readConfigFile(configPath) ?? {};
				writeConfig(configPath, { ...updatedConfig, defaultSocialSetId });
				console.error(pc.green(`✓ Default social set saved: ${defaultSocialSetId}`));
			} else if (noDefault) {
				console.error(pc.dim('Skipping default social set configuration.'));
			} else {
				// Fetch social sets
				let socialSets: Record<string, unknown> | null = null;
				const origKey = process.env.TYPEFULLY_API_KEY;
				process.env.TYPEFULLY_API_KEY = apiKey;
				try {
					socialSets = (await apiRequest('GET', '/social-sets?limit=50', null, {
						exitOnError: false,
					})) as Record<string, unknown>;
				} catch (err) {
					console.error(pc.yellow(`⚠ Could not fetch social sets: ${(err as Error).message}`));
				}
				if (origKey) process.env.TYPEFULLY_API_KEY = origKey;
				else delete process.env.TYPEFULLY_API_KEY;

				if (socialSets) {
					const results = socialSets.results as readonly Record<string, unknown>[] | undefined;
					if (!results || results.length === 0) {
						console.error(pc.yellow('⚠ No social sets found.'));
						console.error(pc.dim('Connect a social account at typefully.com'));
					} else if (results.length === 1) {
						const firstSet = results[0] as Record<string, unknown>;
						defaultSocialSetId = firstSet.id as string | number;
						const updatedConfig = readConfigFile(configPath) ?? {};
						writeConfig(configPath, { ...updatedConfig, defaultSocialSetId });
						const name = String(firstSet.name || 'Unnamed');
						const username = firstSet.username ? ` @${firstSet.username}` : '';
						console.error(pc.green(`✓ Default social set: ${pc.bold(name)}${pc.dim(username)}`));
					} else if (isNonInteractive) {
						console.error(
							pc.blue(
								`→ Found ${results.length} social sets. Use --default-social-set <id> to set one as default.`,
							),
						);
					} else {
						const formatted = formatSocialSetsForDisplay(results);
						console.error('');
						console.error(pc.bold('Choose a default social set'));
						console.error(
							pc.dim("This will be used when you don't specify one. You can always override it."),
						);
						console.error('');
						for (const f of formatted) console.error(f.displayLine);
						console.error('');

						const choice = await clack.text({
							message: 'Enter number (or press Enter to skip)',
						});

						if (!clack.isCancel(choice) && choice) {
							const choiceNum = Number.parseInt(choice, 10);
							if (!Number.isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= formatted.length) {
								defaultSocialSetId = formatted[choiceNum - 1]?.set.id as string | number;
								const updatedConfig = readConfigFile(configPath) ?? {};
								writeConfig(configPath, { ...updatedConfig, defaultSocialSetId });
								console.error(pc.green('✓ Default social set saved'));
							}
						}
					}
				}
			}

			output({
				success: true,
				message: 'Setup complete',
				config_path: configPath,
				scope: isLocal ? 'local' : 'global',
				default_social_set_id: defaultSocialSetId,
			});
		});
}
