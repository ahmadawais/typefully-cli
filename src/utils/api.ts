import { API_BASE, requireApiKey } from './config.js';
import { output } from './output.js';

export { display, isJsonMode, output, setJsonMode, spin } from './output.js';

interface ApiRequestOptions {
	readonly headers?: Record<string, string>;
	readonly rawBody?: Buffer | Uint8Array;
	readonly baseUrl?: string;
	readonly exitOnError?: boolean;
}

export async function apiRequest(
	method: string,
	endpoint: string,
	body?: Record<string, unknown> | null,
	opts: ApiRequestOptions = {},
): Promise<unknown> {
	const { exitOnError = true } = opts;
	const { key } = await requireApiKey();
	const url = `${opts.baseUrl || API_BASE}${endpoint}`;

	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
		...opts.headers,
	};

	const fetchOpts: RequestInit = { method, headers };

	if (opts.rawBody) {
		fetchOpts.body = opts.rawBody as BodyInit;
	} else if (body) {
		headers['Content-Type'] = 'application/json';
		fetchOpts.body = JSON.stringify(body);
	}

	const res = await fetch(url, fetchOpts);

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
		if (exitOnError) {
			console.error(JSON.stringify({ error: `HTTP ${res.status}`, response: parsed }, null, 2));
			process.exit(1);
		}
		const err = new Error(`HTTP ${res.status}`) as Error & {
			response: unknown;
			status: number;
		};
		err.response = parsed;
		err.status = res.status;
		throw err;
	}

	const text = await res.text();
	if (!text) return {};

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
