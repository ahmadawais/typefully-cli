import { exec } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { Command } from 'commander';
import { apiRequest, display } from '../utils/api.js';
import { getDefaultTimezone, requireSocialSetId, tzLabel } from '../utils/config.js';
import { firstPostText, renderDraft } from './drafts.js';

type DraftRaw = Record<string, unknown>;

function toUTCIso(dateStr: string, timeStr: string, tz: string): string {
	const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(naiveUTC);
	const get = (type: string) => parts.find((pt) => pt.type === type)?.value ?? '00';
	const localISO = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`;
	const localDate = new Date(localISO);
	const offset = naiveUTC.getTime() - localDate.getTime();
	return new Date(naiveUTC.getTime() + offset).toISOString();
}

function todayInTimezone(tz: string): string {
	return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function formatScheduledAt(draft: DraftRaw, tz: string): string {
	if (!draft.scheduled_at) return '';
	try {
		return new Date(String(draft.scheduled_at)).toLocaleString('en-US', {
			timeZone: tz,
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});
	} catch {
		return String(draft.scheduled_at);
	}
}

export async function runScheduler(): Promise<void> {
	const id = requireSocialSetId(null);
	const tz = getDefaultTimezone();
	const tz_label = tzLabel(tz);

	const fetchSpinner = p.spinner();
	fetchSpinner.start('Fetching drafts…');
	const data = (await apiRequest('GET', `/social-sets/${id}/drafts?limit=50`)) as DraftRaw;
	const results = (data.results ?? []) as DraftRaw[];
	const schedulable = results.filter((d) => d.status === 'draft' || d.status === 'scheduled');

	if (schedulable.length === 0) {
		fetchSpinner.stop('No drafts found.');
		p.cancel('No drafts available to schedule.');
		process.exit(0);
	}

	const fullDrafts = await Promise.all(
		schedulable.map((draft) =>
			apiRequest('GET', `/social-sets/${id}/drafts/${draft.id}`).catch(() => draft),
		),
	);
	fetchSpinner.stop(`${fullDrafts.length} draft${fullDrafts.length !== 1 ? 's' : ''} loaded`);

	const draftChoice = await p.select({
		message: 'Pick a draft',
		options: (fullDrafts as DraftRaw[]).map((draft) => {
			const preview = firstPostText(draft, 65) || pc.dim('(no text)');
			const status = String(draft.status ?? 'draft');
			const scheduled = formatScheduledAt(draft, tz);
			const hint = scheduled ? `${status} · ${scheduled} ${tz_label}` : status;
			return {
				value: String(draft.id),
				label: `${preview}\n`,
				hint,
			};
		}),
	});
	if (p.isCancel(draftChoice)) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	const scheduleType = await p.select({
		message: 'When to publish?',
		initialValue: 'next-free-slot',
		options: [
			{ value: 'next-free-slot', label: 'Next free slot' },
			{ value: 'custom', label: `Custom date & time  ${pc.dim(`(${tz_label})`)}` },
		],
	});
	if (p.isCancel(scheduleType)) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	let publishAt: string;

	if (scheduleType === 'next-free-slot') {
		publishAt = 'next-free-slot';
	} else {
		const today = todayInTimezone(tz);

		const dateInput = await p.text({
			message: `Date  ${pc.dim(`(${tz_label}, YYYY-MM-DD)`)}`,
			placeholder: today,
			initialValue: today,
			validate: (v = '') => {
				if (!v.trim()) return 'Date is required';
				if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return 'Use YYYY-MM-DD format';
				if (Number.isNaN(Date.parse(v.trim()))) return 'Invalid date';
			},
		});
		if (p.isCancel(dateInput)) {
			p.cancel('Cancelled.');
			process.exit(0);
		}

		const timeInput = await p.text({
			message: `Time  ${pc.dim(`(${tz_label}, HH:MM 24h)`)}`,
			placeholder: '09:00',
			initialValue: '09:00',
			validate: (v = '') => {
				if (!v.trim()) return 'Time is required';
				if (!/^\d{2}:\d{2}$/.test(v.trim())) return 'Use HH:MM format';
				const [h, m] = v.trim().split(':').map(Number);
				if ((h as number) > 23 || (m as number) > 59) return 'Invalid time';
			},
		});
		if (p.isCancel(timeInput)) {
			p.cancel('Cancelled.');
			process.exit(0);
		}

		publishAt = toUTCIso((dateInput as string).trim(), (timeInput as string).trim(), tz);
	}

	const confirmMsg =
		scheduleType === 'next-free-slot'
			? 'Schedule to next free slot?'
			: `Schedule for ${new Date(publishAt).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ${tz_label}?`;

	const confirmed = await p.confirm({
		message: confirmMsg,
		initialValue: true,
	});
	if (p.isCancel(confirmed) || !confirmed) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	const s = p.spinner();
	s.start('Scheduling…');
	const result = (await apiRequest(
		'PATCH',
		`/social-sets/${id}/drafts/${draftChoice as string}`,
		{ publish_at: publishAt },
	)) as DraftRaw;
	s.stop('');

	display(result, () => renderDraft(result, 'Draft scheduled'));

	const draftUrl = String(result.share_url ?? `https://typefully.com/?d=${draftChoice as string}`);
	const openBrowser = await p.confirm({
		message: 'Open in browser?',
		initialValue: true,
	});
	if (!p.isCancel(openBrowser) && openBrowser) {
		const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
		exec(`${cmd} "${draftUrl}"`);
	}
}

export function registerScheduleCommand(program: Command): void {
	program
		.command('schedule')
		.description('Interactively browse drafts and schedule one')
		.action(async () => {
			await runScheduler();
		});
}
