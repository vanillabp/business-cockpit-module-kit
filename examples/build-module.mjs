// Builds an example workflow module the way a real one builds: one ES module per entry with the
// content hash in its name, no bare imports, and bc-manifest.json written from esbuild's list of
// outputs. Then it runs bc-check-entries on the result, with the module's own data entries.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';
import { createManifest } from '@vanillabp/bc-module-kit';
import { checkEntries } from '@vanillabp/bc-module-kit/check';

/**
 * @param {string} moduleDir the folder of the example module
 * @param {Record<string, string>} entries entry name -> source file, relative to the module
 * @param {string[]} [dataEntries] data entries of the module beyond the four of the kit, for example Header
 */
export async function buildModule(moduleDir, entries, dataEntries = []) {
  const outdir = resolve(moduleDir, 'dist');
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const entryPoints = Object.fromEntries(Object.entries(entries).map(([name, source]) => [name, resolve(moduleDir, source)]));
  const result = await build({
    entryPoints,
    absWorkingDir: moduleDir,
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    metafile: true,
    entryNames: 'entries/[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'false',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    logLevel: 'warning',
  });

  const metafilePath = join(outdir, 'meta.json');
  writeFileSync(metafilePath, JSON.stringify(result.metafile));
  // esbuild names each output relative to the module folder.
  return writeManifestAndCheck(moduleDir, entries, metafilePath, dataEntries, moduleDir);
}

/**
 * Writes dist/bc-manifest.json from the list of outputs in an esbuild metafile and runs
 * bc-check-entries on the result. The Angular example calls it after `ng build`, whose
 * browser-stats.json is such a metafile.
 *
 * @param {string} moduleDir the folder of the example module
 * @param {Record<string, string>} entries entry name -> source file, relative to the module
 * @param {string} metafilePath the metafile of the build
 * @param {string[]} dataEntries data entries of the module beyond the four of the kit
 * @param {string} outputBase the folder the metafile names its outputs relative to
 */
export function writeManifestAndCheck(moduleDir, entries, metafilePath, dataEntries, outputBase) {
  const outdir = resolve(moduleDir, 'dist');
  const { outputs } = JSON.parse(readFileSync(metafilePath, 'utf8'));
  // The manifest: entry name -> file, from the build's own list of outputs.
  const files = {};
  for (const [output, { entryPoint }] of Object.entries(outputs)) {
    if (!entryPoint) continue;
    const name = Object.keys(entries).find((key) => resolve(moduleDir, entryPoint) === resolve(moduleDir, entries[key]));
    if (name) files[name] = relative(outdir, resolve(outputBase, output)).split('\\').join('/');
  }
  const missing = Object.keys(entries).filter((name) => !files[name]);
  if (missing.length > 0) throw new Error(`The build of ${moduleDir} wrote no file for ${missing.join(', ')}`);
  const manifestPath = join(outdir, 'bc-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(createManifest({ entries: files, buildVersion: '1.0.0' }), null, 2)}\n`);

  const { problems } = checkEntries(manifestPath, { metafile: metafilePath, dataEntries });
  if (problems.length > 0) throw new Error(`bc-check-entries failed for ${moduleDir}:\n- ${problems.join('\n- ')}`);
  return { manifestPath, metafilePath };
}
