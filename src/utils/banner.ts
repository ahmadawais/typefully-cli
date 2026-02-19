import pc from 'picocolors';

const BANNER = `
⠛⣿⠛ ⣿⣤⣿ ⣿⠛⣿ ⣿⠛⠛ ⣿⠛⠛ ⣿ ⣿ ⣿   ⣿   ⣿⣤⣿
 ⣿   ⣿  ⣿⠛⠛ ⣿⣿⣤ ⣿⠛  ⣿⣤⣿ ⣿⣤⣤ ⣿⣤⣤  ⣿
`;

export function showBanner(): void {
	console.error(pc.dim(BANNER));
}
