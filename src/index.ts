import { createCli } from './cli.js';

const program = createCli();
program.parseAsync(process.argv).catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
