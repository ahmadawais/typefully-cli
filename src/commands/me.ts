import type { Command } from 'commander';
import pc from 'picocolors';
import { apiRequest, display, spin } from '../utils/api.js';

/** Known fields rendered in a specific order/format before fallback fields. */
const KNOWN_ORDER = ['id', 'email', 'username', 'plan', 'timezone', 'locale', 'avatar_url'];

function renderMe(data: Record<string, unknown>): void {
	console.log('');
	console.log(`  ${pc.bold(String(data.name ?? 'Unknown'))}`);
	console.log('');

	const rendered = new Set(['name']);

	// Render known fields first, in order
	for (const key of KNOWN_ORDER) {
		if (!(key in data) || data[key] == null || data[key] === '') continue;
		const val = data[key];
		const label = key === 'avatar_url' ? 'Avatar' : key.replace(/_/g, ' ');
		const display_val = key === 'username' ? `@${val}` : String(val);
		console.log(`  ${pc.dim(`${label}:`).padEnd(22)} ${display_val}`);
		rendered.add(key);
	}

	// Render any remaining scalar fields returned by the API
	for (const [key, val] of Object.entries(data)) {
		if (rendered.has(key) || val == null || val === '') continue;
		if (typeof val === 'object' && !Array.isArray(val)) {
			// Nested object — render as indented key:value pairs
			const nested = val as Record<string, unknown>;
			console.log(`  ${pc.dim(`${key.replace(/_/g, ' ')}:`)}`);
			for (const [nk, nv] of Object.entries(nested)) {
				if (nv == null || nv === '') continue;
				console.log(`    ${pc.dim(`${nk.replace(/_/g, ' ')}:`).padEnd(22)} ${nv}`);
			}
		} else if (Array.isArray(val)) {
			if (val.length > 0) {
				console.log(`  ${pc.dim(`${key.replace(/_/g, ' ')}:`)} ${(val as unknown[]).join(', ')}`);
			}
		} else {
			const label = key.replace(/_/g, ' ');
			console.log(`  ${pc.dim(`${label}:`).padEnd(22)} ${val}`);
		}
		rendered.add(key);
	}

	console.log('');
}

export function registerMeCommand(program: Command): void {
	program
		.command('me')
		.description('Get authenticated user info')
		.action(async () => {
			const spinner = spin('Fetching user info…');
			spinner.start();
			const data = await apiRequest('GET', '/me');
			spinner.stop();
			display(data, () => renderMe(data as Record<string, unknown>));
		});
}
