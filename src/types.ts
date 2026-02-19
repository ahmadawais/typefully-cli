import { z } from 'zod/v4';

// Config schema — matches the JSON written by setup / config:set-default
export const ConfigSchema = z.object({
	apiKey: z.string().optional(),
	defaultSocialSetId: z.union([z.string(), z.number()]).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface DefaultSocialSet {
	readonly source: string;
	readonly id: string | number;
}

// API types
export interface ApiKeyInfo {
	readonly source: string;
	readonly key: string;
}

export interface SocialSet {
	readonly id: number;
	readonly name: string;
	readonly platforms: readonly Platform[];
	[key: string]: unknown;
}

export interface Platform {
	readonly type: string;
	readonly username?: string;
	readonly connected: boolean;
	[key: string]: unknown;
}

export interface Draft {
	readonly id: string;
	readonly text?: string;
	readonly status?: string;
	readonly social_set_id?: number;
	[key: string]: unknown;
}

export interface Tag {
	readonly id: string;
	readonly name: string;
	[key: string]: unknown;
}

export interface MediaUploadResponse {
	readonly media_id: string;
	readonly presigned_url: string;
	readonly file_name: string;
	[key: string]: unknown;
}

export interface MediaStatusResponse {
	readonly media_id: string;
	readonly status: string;
	[key: string]: unknown;
}

export interface UserInfo {
	readonly id: number;
	readonly email?: string;
	readonly name?: string;
	[key: string]: unknown;
}

export interface ApiError {
	readonly error: string;
	readonly details?: Record<string, unknown>;
}

// Content type mapping
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	pdf: 'application/pdf',
};

// Platform names
export const PLATFORMS = ['x', 'linkedin', 'threads', 'bluesky', 'mastodon'] as const;
export type PlatformName = (typeof PLATFORMS)[number];
