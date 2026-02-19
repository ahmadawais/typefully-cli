import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { apiRequest, display, sleep, spin } from '../utils/api.js';
import { requireSocialSetId } from '../utils/config.js';
import { exitWithError, sanitizeFilename } from '../utils/helpers.js';

export function registerMediaCommand(program: Command): void {
	const cmd = program.command('media').description('Manage media uploads');

	cmd
		.command('upload')
		.description('Upload a media file')
		.argument('<file_path>', 'Path to file')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.option('--social-set-id <id>', 'Social set ID via flag')
		.option('--no-wait', 'Return immediately after upload')
		.option('--timeout <seconds>', 'Max wait for processing (default: 60)')
		.action(
			async (filePath: string, socialSetId: string | undefined, opts: Record<string, unknown>) => {
				const flagId = opts.socialSetId as string | undefined;
				const id = requireSocialSetId(flagId ?? socialSetId ?? null);

				if (!fs.existsSync(filePath)) exitWithError(`File not found: ${filePath}`);

				const rawFilename = path.basename(filePath);
				const filename = sanitizeFilename(rawFilename);
				const timeout = Number.parseInt(String(opts.timeout ?? '60'), 10) * 1000;
				const pollIntervalMs = (() => {
					const raw = process.env.TYPEFULLY_MEDIA_POLL_INTERVAL_MS;
					if (!raw) return 2000;
					const n = Number.parseInt(raw, 10);
					return Number.isFinite(n) && n >= 0 ? n : 2000;
				})();

				// Step 1: Get presigned URL
				const spinner = spin(`Uploading ${pc.bold(rawFilename)}…`);
				spinner.start();
				const presignedResponse = (await apiRequest('POST', `/social-sets/${id}/media/upload`, {
					file_name: filename,
				})) as Record<string, unknown>;

				const uploadUrl = presignedResponse.upload_url as string;
				const mediaId = presignedResponse.media_id as string;

				if (!uploadUrl)
					exitWithError('Failed to get presigned URL', { response: presignedResponse });

				// Step 2: Upload to S3
				const fileBuffer = fs.readFileSync(filePath);
				const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: fileBuffer });

				if (!uploadResponse.ok) {
					spinner.fail('Upload failed');
					exitWithError('Failed to upload file to S3', {
						http_code: uploadResponse.status,
						status_text: uploadResponse.statusText,
					});
				}

				// Step 3: Poll for processing (unless --no-wait)
				if (opts.wait === false) {
					spinner.succeed('Uploaded');
					display(
						{ media_id: mediaId, message: 'Upload complete. Use media status to check processing.' },
						() => {
							console.log('');
							console.log(`  ${pc.green('✓')} Uploaded  ·  ID: ${pc.bold(mediaId)}`);
							console.log(pc.dim('  Run: typefully media status <id> to check processing'));
							console.log('');
						},
					);
					return;
				}

				spinner.text = 'Processing…';
				const startTime = Date.now();
				while (Date.now() - startTime < timeout) {
					const statusResponse = (await apiRequest(
						'GET',
						`/social-sets/${id}/media/${mediaId}`,
					)) as Record<string, unknown>;

					if (statusResponse.status === 'ready') {
						spinner.succeed('Media ready');
						display({ media_id: mediaId, status: 'ready', message: 'Media uploaded and ready' }, () => {
							console.log('');
							console.log(`  ${pc.green('✓')} Media ready  ·  ID: ${pc.bold(mediaId)}`);
							console.log('');
						});
						return;
					}

					if (statusResponse.status === 'error' || statusResponse.status === 'failed') {
						spinner.fail('Processing failed');
						exitWithError('Media processing failed', { status: statusResponse });
					}

					await sleep(pollIntervalMs);
				}

				spinner.stop();
				const timeoutResult = {
					media_id: mediaId,
					status: 'processing',
					message: 'Upload complete but still processing. Use media status to check.',
					hint: 'Increase timeout with --timeout <seconds>',
				};
				display(timeoutResult, () => {
					console.log('');
					console.log(`  ${pc.yellow('⚠')} Still processing  ·  ID: ${pc.bold(mediaId)}`);
					console.log(pc.dim('  Run: typefully media status <id> to check'));
					console.log('');
				});
			},
		);

	cmd
		.command('status')
		.description('Check media upload status')
		.argument('<media_id>', 'Media ID')
		.argument('[social_set_id]', 'Social set ID (uses default if omitted)')
		.option('--social-set-id <id>', 'Social set ID via flag')
		.action(
			async (mediaId: string, socialSetId: string | undefined, opts: Record<string, string>) => {
				const flagId = opts.socialSetId;
				const id = requireSocialSetId(flagId ?? socialSetId ?? null);
				const spinner = spin('Checking media status…');
				spinner.start();
				const data = await apiRequest('GET', `/social-sets/${id}/media/${mediaId}`);
				spinner.stop();
				display(data, () => {
					const d = data as Record<string, unknown>;
					const status = String(d.status ?? 'unknown');
					const icon =
						status === 'ready'
							? pc.green('✓')
							: status === 'error' || status === 'failed'
								? pc.red('✗')
								: pc.yellow('⏳');
					console.log('');
					console.log(`  ${icon} ${pc.bold(mediaId)}  ·  ${status}`);
					console.log('');
				});
			},
		);
}
