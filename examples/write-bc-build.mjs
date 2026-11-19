// Writes src/bc-build.js of an example module with the two values the names of its web components
// are built from, see src/element-names.js of each example:
//
// - WORKFLOW_MODULE_ID, from `config.workflowModuleId` in the module's package.json. It has to be
//   the id the module registers with at the cockpit, or the cockpit refuses every name of the module.
// - BUILD_ID, the time of this build in milliseconds, in base 36. Every build gets new names. The
//   browser defines a name only once per page, so with new names a new build of the module loads
//   while somebody has the cockpit open, without a reload of the page.
//
// The file is written for every build and not checked in, see .gitignore. The manifest gets the
// same time as `buildTimestamp`, see readBuildTime, so the manifest and the names speak of one build.
//
// Usage: node examples/write-bc-build.mjs <folder of the example module>

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Writes `src/bc-build.js` of a module and returns the time of the build.
 *
 * @param {string} moduleDir the folder of the example module
 * @returns {Date}
 */
export function writeBcBuild(moduleDir) {
  const { config } = JSON.parse(readFileSync(join(moduleDir, 'package.json'), 'utf8'));
  const buildTime = new Date();
  const buildId = buildTime.getTime().toString(36);
  writeFileSync(join(moduleDir, 'src', 'bc-build.js'), [
    '// Written by examples/write-bc-build.mjs for every build. Not checked in.',
    `export const WORKFLOW_MODULE_ID = ${JSON.stringify(config.workflowModuleId)};`,
    `export const BUILD_ID = '${buildId}';`,
    '',
  ].join('\n'));
  return buildTime;
}

/**
 * Reads the time of the build back from `src/bc-build.js` of a module.
 *
 * @param {string} moduleDir the folder of the example module
 * @returns {Promise<Date>}
 */
export async function readBuildTime(moduleDir) {
  const { BUILD_ID } = await import(pathToFileURL(join(moduleDir, 'src', 'bc-build.js')).href);
  return new Date(Number.parseInt(BUILD_ID, 36));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  writeBcBuild(resolve(process.argv[2] ?? '.'));
}
