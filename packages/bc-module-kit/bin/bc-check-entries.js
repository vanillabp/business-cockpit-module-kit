#!/usr/bin/env node
// Checks the entries of a workflow module's bc-manifest.json after its build.
// Run `bc-check-entries --help` for the options.

import { parseArgs } from 'node:util';
import { checkEntries, DEFAULT_LIMIT_BYTES } from '../src/check.js';

const usage = `Usage: bc-check-entries <path to bc-manifest.json> [options]

Fails when an entry of the manifest has no file, or when a data entry, with
every file it imports, is larger than the limit, imports a bare name or
contains framework code.

Options:
  --limit <size>        the limit of a data entry, like 32kb (default ${DEFAULT_LIMIT_BYTES / 1024}kb)
  --data-entry <name>   one more data entry, for example Header; may be given again
  --metafile <path>     esbuild's metafile, to find framework packages by their inputs
  --help                shows this text
`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: 'string' },
      'data-entry': { type: 'string', multiple: true },
      metafile: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage}`);
  process.exit(2);
}

const { values, positionals } = parsed;
if (values.help) {
  process.stdout.write(usage);
  process.exit(0);
}
if (positionals.length !== 1) {
  process.stderr.write(usage);
  process.exit(2);
}

let result;
try {
  result = checkEntries(positionals[0], {
    limit: values.limit,
    dataEntries: values['data-entry'],
    metafile: values.metafile,
  });
} catch (error) {
  process.stderr.write(`bc-check-entries: ${error.message}\n`);
  process.exit(2);
}

for (const { entry, files, bytes } of result.dataEntries) {
  process.stdout.write(`${entry}: ${bytes} bytes in ${files.length} file(s)\n`);
}
if (result.problems.length > 0) {
  process.stderr.write(`bc-check-entries found ${result.problems.length} problem(s):\n`);
  for (const problem of result.problems) process.stderr.write(`- ${problem}\n`);
  process.exit(1);
}
process.stdout.write('bc-check-entries: every entry is fine\n');
