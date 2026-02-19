import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '..', 'dist', 'index.js');

interface CliResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

function runCli(
	args: readonly string[],
	opts: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<CliResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [CLI_PATH, ...args], {
			cwd: opts.cwd,
			env: { ...process.env, ...opts.env, NO_COLOR: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (d: string) => {
			stdout += d;
		});
		child.stderr.on('data', (d: string) => {
			stderr += d;
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`CLI timeout after ${opts.timeoutMs ?? 5000}ms`));
		}, opts.timeoutMs ?? 5000);

		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr });
		});
	});
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

interface MockServer {
	readonly server: http.Server;
	readonly port: number;
	readonly requests: { method: string; url: string; body: string }[];
	readonly baseUrl: string;
	addHandler: (method: string, path: string, response: unknown, statusCode?: number) => void;
	close: () => Promise<void>;
}

async function createMockServer(): Promise<MockServer> {
	const requests: { method: string; url: string; body: string }[] = [];
	const handlers: Map<string, { response: unknown; statusCode: number }> = new Map();

	const server = http.createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk as Buffer);
		const body = Buffer.concat(chunks).toString();
		requests.push({ method: req.method ?? '', url: req.url ?? '', body });

		const key = `${req.method} ${req.url?.split('?')[0]}`;
		const handler = handlers.get(key);

		if (handler) {
			res.writeHead(handler.statusCode, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(handler.response));
		} else {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
		}
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const addr = server.address() as { port: number };

	return {
		server,
		port: addr.port,
		requests,
		baseUrl: `http://127.0.0.1:${addr.port}`,
		addHandler: (method, p, response, statusCode = 200) => {
			handlers.set(`${method} ${p}`, { response, statusCode });
		},
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

async function makeSandbox(): Promise<{
	root: string;
	cwd: string;
	home: string;
	cleanup: () => Promise<void>;
}> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'typefully-test-'));
	const cwd = path.join(root, 'cwd');
	const home = path.join(root, 'home');
	await fs.mkdir(cwd, { recursive: true });
	await fs.mkdir(home, { recursive: true });
	return {
		root,
		cwd,
		home,
		cleanup: async () => {
			await fs.rm(root, { recursive: true, force: true });
		},
	};
}

describe('CLI basics', () => {
	it('should output version with -v', async () => {
		const result = await runCli(['-v']);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe('0.0.1');
	});

	it('should output version with --version', async () => {
		const result = await runCli(['--version']);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe('0.0.1');
	});

	it('should show help with --help', async () => {
		const result = await runCli(['--help']);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain('typefully');
		expect(result.stdout).toContain('setup');
		expect(result.stdout).toContain('drafts');
	});

	it('should show help with -h', async () => {
		const result = await runCli(['-h']);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain('typefully');
	});

	it('should show help for subcommands', async () => {
		const result = await runCli(['drafts', '--help']);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain('list');
		expect(result.stdout).toContain('create');
		expect(result.stdout).toContain('update');
		expect(result.stdout).toContain('delete');
	});
});

describe('API key error', () => {
	let sandbox: Awaited<ReturnType<typeof makeSandbox>>;

	beforeEach(async () => {
		sandbox = await makeSandbox();
	});
	afterEach(async () => {
		await sandbox.cleanup();
	});

	it('should error when no API key is configured', async () => {
		const result = await runCli(['me'], {
			cwd: sandbox.cwd,
			env: {
				HOME: sandbox.home,
				TYPEFULLY_API_KEY: '',
				TYPEFULLY_API_BASE: 'http://127.0.0.1:1',
			},
		});
		expect(result.code).toBe(1);
		// stderr may contain banner output before the JSON error
		const jsonMatch = result.stderr.match(/\{[\s\S]*\}/);
		expect(jsonMatch).toBeTruthy();
		const json = parseJson(jsonMatch?.[0]);
		expect(json).toBeTruthy();
		expect((json as Record<string, unknown>).error).toContain('API key not found');
	});
});

describe('Commands with mock server', () => {
	let mock: MockServer;
	let sandbox: Awaited<ReturnType<typeof makeSandbox>>;

	beforeAll(async () => {
		mock = await createMockServer();
	});
	afterAll(async () => {
		await mock.close();
	});
	beforeEach(async () => {
		sandbox = await makeSandbox();
		mock.requests.length = 0;
	});
	afterEach(async () => {
		await sandbox.cleanup();
	});

	function cliEnv(): Record<string, string> {
		return {
			TYPEFULLY_API_KEY: 'test-key-12345',
			TYPEFULLY_API_BASE: mock.baseUrl,
			HOME: sandbox.home,
		};
	}

	it('me: should fetch user info', async () => {
		mock.addHandler('GET', '/me', { id: 1, email: 'test@test.com', name: 'Test User' });
		const result = await runCli(['me'], { cwd: sandbox.cwd, env: cliEnv() });
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout);
		expect((json as Record<string, unknown>).id).toBe(1);
		expect((json as Record<string, unknown>).email).toBe('test@test.com');
	});

	it('social-sets list: should list social sets', async () => {
		mock.addHandler('GET', '/social-sets', { results: [{ id: 123, name: 'My Account' }] });
		const result = await runCli(['social-sets', 'list'], { cwd: sandbox.cwd, env: cliEnv() });
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect((json.results as unknown[])[0]).toHaveProperty('id', 123);
	});

	it('social-sets get: should get social set by ID', async () => {
		mock.addHandler('GET', '/social-sets/123', {
			id: 123,
			name: 'My Account',
			platforms: { x: { username: 'test' } },
		});
		const result = await runCli(['social-sets', 'get', '123'], { cwd: sandbox.cwd, env: cliEnv() });
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect(json.id).toBe(123);
	});

	it('drafts list: should list drafts', async () => {
		mock.addHandler('GET', '/social-sets/123/drafts', {
			results: [{ id: 'draft-1', text: 'Hello' }],
		});
		const result = await runCli(['drafts', 'list', '123'], { cwd: sandbox.cwd, env: cliEnv() });
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect((json.results as unknown[]).length).toBe(1);
	});

	it('drafts create: should create a draft', async () => {
		mock.addHandler('GET', '/social-sets/123', {
			id: 123,
			platforms: { x: { username: 'test' } },
		});
		mock.addHandler('POST', '/social-sets/123/drafts', { id: 'draft-new', status: 'draft' });
		const result = await runCli(
			['drafts', 'create', '123', '--text', 'Hello world!', '--platform', 'x'],
			{ cwd: sandbox.cwd, env: cliEnv() },
		);
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect(json.id).toBe('draft-new');
		// Verify the POST was made
		const postReq = mock.requests.find((r) => r.method === 'POST');
		expect(postReq).toBeTruthy();
		const postBody = JSON.parse(postReq?.body) as Record<string, unknown>;
		expect(postBody.platforms).toBeTruthy();
	});

	it('drafts delete: should delete a draft with two args', async () => {
		mock.addHandler('DELETE', '/social-sets/123/drafts/456', { ok: true });
		const result = await runCli(['drafts', 'delete', '123', '456'], {
			cwd: sandbox.cwd,
			env: cliEnv(),
		});
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect(json.success).toBe(true);
	});

	it('tags list: should list tags', async () => {
		mock.addHandler('GET', '/social-sets/123/tags', {
			results: [{ id: 't1', name: 'marketing' }],
		});
		const result = await runCli(['tags', 'list', '123'], { cwd: sandbox.cwd, env: cliEnv() });
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect((json.results as unknown[]).length).toBe(1);
	});

	it('tags create: should create a tag', async () => {
		mock.addHandler('POST', '/social-sets/123/tags', { id: 't-new', name: 'product' });
		const result = await runCli(['tags', 'create', '123', '--name', 'product'], {
			cwd: sandbox.cwd,
			env: cliEnv(),
		});
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect(json.name).toBe('product');
	});

	it('config show: should show config', async () => {
		const result = await runCli(['config', 'show'], { cwd: sandbox.cwd, env: cliEnv() });
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect(json.configured).toBe(true);
		expect(json.active_source).toBe('environment variable');
	});

	it('config show: should show not configured when no key', async () => {
		const result = await runCli(['config', 'show'], {
			cwd: sandbox.cwd,
			env: { HOME: sandbox.home, TYPEFULLY_API_KEY: '', TYPEFULLY_API_BASE: mock.baseUrl },
		});
		expect(result.code).toBe(0);
		const json = parseJson(result.stdout) as Record<string, unknown>;
		expect(json.configured).toBe(false);
	});
});

describe('Helper functions', () => {
	it('splitThreadText should split on --- separator', async () => {
		const { splitThreadText } = await import('../src/utils/helpers.js');
		const result = splitThreadText('First post\n---\nSecond post\n---\nThird post');
		expect(result).toHaveLength(3);
		expect(result[0]).toBe('First post');
		expect(result[1]).toBe('Second post');
		expect(result[2]).toBe('Third post');
	});

	it('splitThreadText should handle CRLF', async () => {
		const { splitThreadText } = await import('../src/utils/helpers.js');
		const result = splitThreadText('First\r\n---\r\nSecond');
		expect(result).toHaveLength(2);
	});

	it('sanitizeFilename should clean filenames', async () => {
		const { sanitizeFilename } = await import('../src/utils/helpers.js');
		expect(sanitizeFilename('my photo (1).jpg')).toBe('my_photo_(1).jpg');
		expect(sanitizeFilename('hello world.png')).toBe('hello_world.png');
	});

	it('parseCsvArg should parse comma-separated values', async () => {
		const { parseCsvArg } = await import('../src/utils/helpers.js');
		expect(parseCsvArg('a,b,c', '--test')).toEqual(['a', 'b', 'c']);
		expect(parseCsvArg('single', '--test')).toEqual(['single']);
		expect(parseCsvArg('', '--test')).toEqual([]);
		expect(parseCsvArg(null, '--test')).toBe(null);
	});
});
