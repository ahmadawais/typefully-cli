import ora, { type Ora } from 'ora';

let _jsonMode = false;

export function setJsonMode(mode: boolean): void {
	_jsonMode = mode;
}

export function isJsonMode(): boolean {
	return _jsonMode || !process.stdout.isTTY;
}

/** Always JSON — used for explicit --json mode and backward-compat. */
export function output(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

/**
 * Smart output: human-readable by default, JSON with --json or when piped.
 * Pass a `humanRenderer` to control the human output; falls back to JSON if omitted.
 */
export function display(data: unknown, humanRenderer?: () => void): void {
	if (!humanRenderer || isJsonMode()) {
		output(data);
		return;
	}
	humanRenderer();
}

interface SpinnerLike {
	start(): void;
	stop(): void;
	succeed(text?: string): void;
	fail(text?: string): void;
	text: string;
}

const NOOP_SPINNER: SpinnerLike = {
	text: '',
	start() {},
	stop() {},
	succeed() {},
	fail() {},
};

export function spin(text: string): Ora | SpinnerLike {
	if (isJsonMode()) return NOOP_SPINNER;
	return ora({ text, color: 'cyan' });
}
