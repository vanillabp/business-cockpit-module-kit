// Runs after `ng build`. The Angular CLI writes one ES module per entry, see src/entries.ts, and
// with `statsJson` its list of outputs in browser-stats.json, the metafile of esbuild, which the
// CLI uses inside. This script takes the file of each entry from that list, writes
// bc-manifest.json and runs bc-check-entries, the same as examples/build-module.mjs does for the
// other examples.

import { renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeManifestAndCheck } from '../../build-module.mjs';

const moduleDir = resolve(import.meta.dirname, '..');
const outdir = join(moduleDir, 'dist');

/** Entry name -> source file, the same as in src/entries.ts. */
const entries = {
  UserTaskList: 'src/data/user-task-list.js',
  UserTaskForm: 'src/data/user-task-form.js',
  Header: 'src/data/header.js',
  ConfirmRideForm: 'src/confirm-ride-form.ts',
  HeaderButtons: 'src/header-buttons.ts',
};

// meta.json is the name the other examples use. The conformance test leaves it out.
const metafilePath = join(outdir, 'meta.json');
renameSync(join(outdir, 'browser-stats.json'), metafilePath);
// The CLI names each output relative to dist.
writeManifestAndCheck(moduleDir, entries, metafilePath, ['Header'], outdir);
