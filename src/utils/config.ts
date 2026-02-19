import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { type ApiKeyInfo, type Config, ConfigSchema, type DefaultSocialSet } from '../types.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', 'typefully');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'config.json');
const LOCAL_CONFIG_DIR = '.typefully';
const LOCAL_CONFIG_FILE = path.join(LOCAL_CONFIG_DIR, 'config.json');

export const API_BASE = process.env.TYPEFULLY_API_BASE || 'https://api.typefully.com/v2';
export const API_KEY_URL = 'https://typefully.com/?settings=api';

export function readConfigFile(configPath: string): Config | null {
	try {
		if (!fs.existsSync(configPath)) return null;
		const content = fs.readFileSync(configPath, 'utf-8');
		const parsed: unknown = JSON.parse(content);
		const result = ConfigSchema.safeParse(parsed);
		if (!result.success) return null;
		return result.data;
	} catch {
		return null;
	}
}

export function getApiKey(): ApiKeyInfo | null {
	if (process.env.TYPEFULLY_API_KEY) {
		return { source: 'environment variable', key: process.env.TYPEFULLY_API_KEY };
	}

	const localPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
	const localConfig = readConfigFile(localPath);
	if (localConfig?.apiKey) {
		return { source: localPath, key: localConfig.apiKey };
	}

	const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
	if (globalConfig?.apiKey) {
		return { source: GLOBAL_CONFIG_FILE, key: globalConfig.apiKey };
	}

	return null;
}

export async function requireApiKey(): Promise<ApiKeyInfo> {
	const info = getApiKey();
	if (info) return info;

	// Non-interactive / piped — show error and exit
	if (!process.stderr.isTTY) {
		console.error(
			JSON.stringify(
				{ error: 'API key not found', hint: 'Run: typefully setup', api_key_url: API_KEY_URL },
				null,
				2,
			),
		);
		process.exit(1);
	}

	// Interactive — guide user through quick setup
	clack.intro(pc.bgCyan(pc.black(' Typefully ')));
	console.error('');
	console.error(pc.dim("  No API key found. Let's get you set up."));
	console.error(`  ${pc.blue('→')} Get your free API key at: ${pc.cyan(API_KEY_URL)}`);
	console.error('');

	const keyInput = await clack.text({
		message: 'Paste your Typefully API key',
		validate: (val = '') => {
			if (!val.trim()) return 'API key is required';
		},
	});

	if (clack.isCancel(keyInput)) {
		clack.outro(pc.dim('Setup cancelled.'));
		process.exit(0);
	}

	const apiKey = keyInput as string;

	const locationChoice = await clack.select({
		message: 'Where should the API key be stored?',
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

	if (clack.isCancel(locationChoice)) {
		clack.outro(pc.dim('Setup cancelled.'));
		process.exit(0);
	}

	const isLocal = locationChoice === 'local';
	const configPath = isLocal ? getLocalConfigFile() : getGlobalConfigFile();
	const existingConfig = readConfigFile(configPath) ?? {};
	writeConfig(configPath, { ...existingConfig, apiKey });

	clack.outro(pc.green(`API key saved. Run ${pc.bold('typefully setup')} for full configuration.`));
	console.error('');

	return { source: configPath, key: apiKey };
}

export function getDefaultPlatforms(): readonly string[] | null {
	const localPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
	const localConfig = readConfigFile(localPath);
	if (localConfig?.defaultPlatforms?.length) return localConfig.defaultPlatforms;

	const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
	if (globalConfig?.defaultPlatforms?.length) return globalConfig.defaultPlatforms;

	return null;
}

export function getDefaultSocialSetId(): DefaultSocialSet | null {
	const localPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
	const localConfig = readConfigFile(localPath);
	if (localConfig?.defaultSocialSetId != null) {
		return { source: localPath, id: localConfig.defaultSocialSetId };
	}

	const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
	if (globalConfig?.defaultSocialSetId != null) {
		return { source: GLOBAL_CONFIG_FILE, id: globalConfig.defaultSocialSetId };
	}

	return null;
}

export function requireSocialSetId(providedId: string | null): string | number {
	if (providedId) return providedId;

	const defaultResult = getDefaultSocialSetId();
	if (defaultResult) return defaultResult.id;

	console.error(
		JSON.stringify(
			{
				error: 'social_set_id is required',
				hint: 'Run: typefully config set-default to set a default, or provide it as an argument',
			},
			null,
			2,
		),
	);
	process.exit(1);
}

export function writeConfig(configPath: string, config: Config): void {
	const dir = path.dirname(configPath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
		mode: 0o600,
	});
}

export function getGlobalConfigFile(): string {
	return GLOBAL_CONFIG_FILE;
}

export function getLocalConfigFile(): string {
	return path.join(process.cwd(), LOCAL_CONFIG_FILE);
}

export function getGlobalConfigDir(): string {
	return GLOBAL_CONFIG_DIR;
}

export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

export function getDefaultTimezone(): string {
	const localPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
	const localConfig = readConfigFile(localPath);
	if (localConfig?.defaultTimezone) return localConfig.defaultTimezone;

	const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
	if (globalConfig?.defaultTimezone) return globalConfig.defaultTimezone;

	return DEFAULT_TIMEZONE;
}

export function tzLabel(tz: string): string {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			timeZoneName: 'short',
		}).formatToParts(new Date());
		return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
	} catch {
		return tz;
	}
}
