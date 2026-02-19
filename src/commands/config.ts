import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';
import { apiRequest, display, spin } from '../utils/api.js';
import { PLATFORMS } from '../types.js';
import {
	API_KEY_URL,
	DEFAULT_TIMEZONE,
	getApiKey,
	getDefaultPlatforms,
	getDefaultSocialSetId,
	getDefaultTimezone,
	getGlobalConfigFile,
	getLocalConfigFile,
	readConfigFile,
	requireApiKey,
	tzLabel,
	writeConfig,
} from '../utils/config.js';
import { exitWithError, formatSocialSetsForDisplay } from '../utils/helpers.js';

function renderConfigShow(data: Record<string, unknown>): void {
	if (!data.configured) {
		console.log('');
		console.log(`  ${pc.yellow('⚠')}  Not configured`);
		console.log(pc.dim(`  Run: typefully setup  ·  Get key at: ${API_KEY_URL}`));
		console.log('');
		return;
	}
	const keyPreview = String(data.api_key_preview ?? '');
	const source = String(data.active_source ?? '');
	const defaultSet = data.default_social_set as { id: string | number; source: string } | null;
	console.log('');
	console.log(`  ${pc.green('✓')}  Configured`);
	console.log(pc.dim(`  API Key: ${keyPreview}  ·  from ${source}`));
	if (defaultSet) {
		console.log(pc.dim(`  Default social set: ${defaultSet.id}  ·  from ${defaultSet.source}`));
	} else {
		console.log(pc.dim('  Default social set: not set  ·  Run: typefully config set-default'));
	}
	const defaultPlatforms = getDefaultPlatforms();
	if (defaultPlatforms) {
		console.log(pc.dim(`  Default platforms: ${defaultPlatforms.join(', ')}`));
	} else {
		console.log(pc.dim('  Default platforms: not set  ·  Run: typefully config set-platforms'));
	}
	const tz = getDefaultTimezone();
	console.log(pc.dim(`  Default timezone: ${tz} (${tzLabel(tz)})`));
	console.log('');
}

export function registerConfigCommand(program: Command): void {
	const cmd = program.command('config').description('Manage CLI configuration');

	cmd
		.command('show')
		.description('Show current config, API key source, and default social set')
		.action(async () => {
			const result = getApiKey();

			if (!result) {
				const data = { configured: false, hint: 'Run: typefully setup', api_key_url: API_KEY_URL };
				display(data, () => renderConfigShow(data as Record<string, unknown>));
				return;
			}

			const localConfigPath = getLocalConfigFile();
			const globalConfigPath = getGlobalConfigFile();
			const localConfig = readConfigFile(localConfigPath);
			const globalConfig = readConfigFile(globalConfigPath);
			const defaultSocialSet = getDefaultSocialSetId();

			const data = {
				configured: true,
				active_source: result.source,
				api_key_preview: `${result.key.slice(0, 8)}...`,
				default_social_set: defaultSocialSet
					? { id: defaultSocialSet.id, source: defaultSocialSet.source }
					: null,
				config_files: {
					local: localConfig
						? {
								path: localConfigPath,
								has_key: !!localConfig.apiKey,
								has_default_social_set: !!localConfig.defaultSocialSetId,
							}
						: null,
					global: globalConfig
						? {
								path: globalConfigPath,
								has_key: !!globalConfig.apiKey,
								has_default_social_set: !!globalConfig.defaultSocialSetId,
							}
						: null,
				},
			};
			display(data, () => renderConfigShow(data as Record<string, unknown>));
		});

	cmd
		.command('set-default')
		.description('Set default social set')
		.argument('[social_set_id]', 'Social set ID (interactive if omitted)')
		.option('--location <location>', 'Storage location: global or local')
		.option('--scope <scope>', 'Alias for --location: global or local')
		.action(async (socialSetIdArg: string | undefined, opts: Record<string, string>) => {
			await requireApiKey();

			let socialSetId: string | number | undefined = socialSetIdArg;
			let location = opts.scope ?? opts.location;

			if (!socialSetId) {
				const spinner = spin('Fetching social sets…');
				spinner.start();
				const socialSets = (await apiRequest('GET', '/social-sets?limit=50')) as Record<
					string,
					unknown
				>;
				spinner.stop();
				const results = socialSets.results as readonly Record<string, unknown>[] | undefined;

				if (!results || results.length === 0) {
					exitWithError('No social sets found. Create one at typefully.com first.');
				}

				const formatted = formatSocialSetsForDisplay(results);

				if (formatted.length === 1) {
					socialSetId = formatted[0]?.set.id as string | number;
					console.error(
						pc.green(`✓ Auto-selecting: ${pc.bold(String(formatted[0]?.set.name || 'Unnamed'))}`),
					);
				} else {
					console.error(pc.bold('Available social sets:'));
					console.error('');
					for (const f of formatted) console.error(f.displayLine);
					console.error('');

					const choice = await clack.text({
						message: 'Enter number',
						validate: (val = '') => {
							const num = Number.parseInt(val, 10);
							if (Number.isNaN(num) || num < 1 || num > formatted.length)
								return 'Invalid selection';
						},
					});

					if (clack.isCancel(choice)) process.exit(0);
					const choiceNum = Number.parseInt(choice, 10);
					socialSetId = formatted[choiceNum - 1]?.set.id as string | number;
				}
			}

			// Verify social set exists
			try {
				await apiRequest('GET', `/social-sets/${socialSetId}`, null, { exitOnError: false });
			} catch {
				exitWithError(`Social set ${socialSetId} not found or not accessible`);
			}

			if (!location) {
				const locationChoice = await clack.select({
					message: 'Where should the default be stored?',
					options: [
						{
							value: 'global',
							label: `Global ${pc.dim('(~/.config/typefully/)')}`,
							hint: 'available to all projects',
						},
						{
							value: 'local',
							label: `Local ${pc.dim('(./.typefully/)')}`,
							hint: 'only this project',
						},
					],
				});
				if (clack.isCancel(locationChoice)) process.exit(0);
				location = locationChoice as string;
			}

			const isLocal = location === 'local';
			const configPath = isLocal ? getLocalConfigFile() : getGlobalConfigFile();
			const existingConfig = readConfigFile(configPath) ?? {};
			writeConfig(configPath, { ...existingConfig, defaultSocialSetId: socialSetId });

			const result = {
				success: true,
				message: 'Default social set configured',
				default_social_set_id: socialSetId,
				config_path: configPath,
				scope: isLocal ? 'local' : 'global',
			};

			display(result, () => {
				console.log('');
				console.log(`  ${pc.green('✓')} Default social set saved: ${pc.bold(String(socialSetId))}`);
				console.log(pc.dim(`  Config: ${configPath}`));
				console.log('');
			});
		});

	cmd
		.command('set-timezone')
		.description('Set default timezone for scheduling')
		.option('--timezone <tz>', 'IANA timezone name (skips interactive)')
		.option('--location <location>', 'Storage location: global or local')
		.option('--scope <scope>', 'Alias for --location')
		.action(async (opts: Record<string, string>) => {
			const COMMON_TIMEZONES = [
				{ value: 'America/Los_Angeles', label: 'America/Los_Angeles', hint: 'PST/PDT' },
				{ value: 'America/Denver', label: 'America/Denver', hint: 'MST/MDT' },
				{ value: 'America/Chicago', label: 'America/Chicago', hint: 'CST/CDT' },
				{ value: 'America/New_York', label: 'America/New_York', hint: 'EST/EDT' },
				{ value: 'America/Sao_Paulo', label: 'America/Sao_Paulo', hint: 'BRT' },
				{ value: 'Europe/London', label: 'Europe/London', hint: 'GMT/BST' },
				{ value: 'Europe/Paris', label: 'Europe/Paris', hint: 'CET/CEST' },
				{ value: 'Europe/Istanbul', label: 'Europe/Istanbul', hint: 'TRT' },
				{ value: 'Asia/Dubai', label: 'Asia/Dubai', hint: 'GST' },
				{ value: 'Asia/Karachi', label: 'Asia/Karachi', hint: 'PKT' },
				{ value: 'Asia/Kolkata', label: 'Asia/Kolkata', hint: 'IST' },
				{ value: 'Asia/Shanghai', label: 'Asia/Shanghai', hint: 'CST' },
				{ value: 'Asia/Tokyo', label: 'Asia/Tokyo', hint: 'JST' },
				{ value: 'Australia/Sydney', label: 'Australia/Sydney', hint: 'AEST/AEDT' },
				{ value: 'custom', label: 'Custom IANA timezone…', hint: 'enter manually' },
			];

			let timezone: string;

			if (opts.timezone) {
				timezone = opts.timezone;
			} else {
				const current = getDefaultTimezone();
				const tzChoice = await clack.select({
					message: 'Default timezone for scheduling',
					initialValue: COMMON_TIMEZONES.some((t) => t.value === current) ? current : 'custom',
					options: COMMON_TIMEZONES,
				});
				if (clack.isCancel(tzChoice)) {
					clack.cancel('Cancelled.');
					process.exit(0);
				}

				if (tzChoice === 'custom') {
					const customTz = await clack.text({
						message: 'Enter IANA timezone name',
						placeholder: DEFAULT_TIMEZONE,
						validate: (v = '') => {
							if (!v.trim()) return 'Timezone is required';
							try {
								Intl.DateTimeFormat(undefined, { timeZone: v });
							} catch {
								return `Invalid timezone: ${v}`;
							}
						},
					});
					if (clack.isCancel(customTz)) {
						clack.cancel('Cancelled.');
						process.exit(0);
					}
					timezone = customTz as string;
				} else {
					timezone = tzChoice as string;
				}
			}

			let location = opts.scope ?? opts.location;
			if (!location) {
				const choice = await clack.select({
					message: 'Where should this be stored?',
					options: [
						{
							value: 'global',
							label: `Global ${pc.dim('(~/.config/typefully/)')}`,
							hint: 'all projects',
						},
						{
							value: 'local',
							label: `Local ${pc.dim('(./.typefully/)')}`,
							hint: 'this project only',
						},
					],
				});
				if (clack.isCancel(choice)) {
					clack.cancel('Cancelled.');
					process.exit(0);
				}
				location = choice as string;
			}

			const isLocal = location === 'local';
			const configPath = isLocal ? getLocalConfigFile() : getGlobalConfigFile();
			const existingConfig = readConfigFile(configPath) ?? {};
			writeConfig(configPath, { ...existingConfig, defaultTimezone: timezone });

			display({ success: true, default_timezone: timezone, config_path: configPath }, () => {
				console.log('');
				console.log(
					`  ${pc.green('✓')} Default timezone saved: ${pc.bold(timezone)} ${pc.dim(`(${tzLabel(timezone)})`)}`,
				);
				console.log(pc.dim(`  Config: ${configPath}`));
				console.log('');
			});
		});

	cmd
		.command('set-platforms')
		.description('Set default platforms for new drafts')
		.option('--platforms <platforms>', 'Comma-separated platforms (skips interactive)')
		.option('--location <location>', 'Storage location: global or local')
		.option('--scope <scope>', 'Alias for --location')
		.action(async (opts: Record<string, string>) => {
			let platformList: string[];

			if (opts.platforms) {
				platformList = opts.platforms.split(',').map((p) => p.trim());
			} else {
				const selected = await clack.multiselect({
					message: 'Default platforms for new drafts',
					initialValues: ['x'] as string[],
					options: PLATFORMS.map((plat) => ({ value: plat, label: plat })),
				});
				if (clack.isCancel(selected)) {
					clack.cancel('Cancelled.');
					process.exit(0);
				}
				platformList = selected as string[];
			}

			let location = opts.scope ?? opts.location;
			if (!location) {
				const choice = await clack.select({
					message: 'Where should this be stored?',
					options: [
						{
							value: 'global',
							label: `Global ${pc.dim('(~/.config/typefully/)')}`,
							hint: 'all projects',
						},
						{
							value: 'local',
							label: `Local ${pc.dim('(./.typefully/)')}`,
							hint: 'this project only',
						},
					],
				});
				if (clack.isCancel(choice)) {
					clack.cancel('Cancelled.');
					process.exit(0);
				}
				location = choice as string;
			}

			const isLocal = location === 'local';
			const configPath = isLocal ? getLocalConfigFile() : getGlobalConfigFile();
			const existingConfig = readConfigFile(configPath) ?? {};
			writeConfig(configPath, { ...existingConfig, defaultPlatforms: platformList });

			display(
				{ success: true, default_platforms: platformList, config_path: configPath },
				() => {
					console.log('');
					console.log(
						`  ${pc.green('✓')} Default platforms saved: ${pc.bold(platformList.join(', '))}`,
					);
					console.log(pc.dim(`  Config: ${configPath}`));
					console.log('');
				},
			);
		});
}
