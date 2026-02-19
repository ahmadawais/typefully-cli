import pc from 'picocolors';

// ANSI Shadow style banner for "typefully"
const BANNER_WIDE = `
████████╗██╗   ██╗██████╗ ███████╗███████╗██╗   ██╗██╗     ██╗  ██╗   ██╗
╚══██╔══╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔════╝██║   ██║██║     ██║  ╚██╗ ██╔╝
   ██║    ╚████╔╝ ██████╔╝█████╗  █████╗  ██║   ██║██║     ██║   ╚████╔╝
   ██║     ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══╝  ██║   ██║██║     ██║    ╚██╔╝
   ██║      ██║   ██║     ███████╗██║     ╚██████╔╝███████╗███████╗██║
   ╚═╝      ╚═╝   ╚═╝     ╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝
`;

// Compact version for narrow terminals
const BANNER_COMPACT = `
▀█▀ █▄█ █▀█ █▀▀ █▀▀ █ █ █   █   █▄█
 █   █  █▀▀ ██▄ █▀  █▄█ █▄▄ █▄▄  █
`;

export function showBanner(): void {
	const cols = process.stdout.columns || 80;
	const banner = cols >= 80 ? BANNER_WIDE : BANNER_COMPACT;
	console.error(pc.dim(banner));
}
