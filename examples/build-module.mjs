// Builds an example workflow module the way a real one builds: one ES module per entry with the
// content hash in its name, no bare imports, and bc-manifest.json written from esbuild's list of
// outputs. Then it runs bc-check-entries on the result, with the module's own data entries.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';
import { createManifest } from '@vanillabp/bc-module-kit';
import { checkEntries } from '@vanillabp/bc-module-kit/check';

/**
 * @param {string} moduleDir the folder of the example module
 * @param {Record<string, string>} entries entry name -> source file, relative to the module
 * @param {string[]} [dataEntries] data entries of the module beyond the four of the kit, for example Header
 * @param {{ plugins?: import('esbuild').Plugin[], define?: Record<string, string> }} [options] what one
 *   framework needs on top, for example the Angular linker
 */
export async function buildModule(moduleDir, entries, dataEntries = [], { plugins = [], define = {} } = {}) {
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
      ...define,
    },
    plugins,
    logLevel: 'warning',
  });

  // The manifest: entry name -> file, from esbuild's own list of outputs.
  const files = {};
  for (const [output, { entryPoint }] of Object.entries(result.metafile.outputs)) {
    if (!entryPoint) continue;
    const name = Object.keys(entryPoints).find((key) => resolve(moduleDir, entryPoint) === entryPoints[key]);
    if (name) files[name] = relative(outdir, resolve(moduleDir, output)).split('\\').join('/');
  }
  const manifestPath = join(outdir, 'bc-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(createManifest({ entries: files, buildVersion: '1.0.0' }), null, 2)}\n`);
  const metafilePath = join(outdir, 'meta.json');
  writeFileSync(metafilePath, JSON.stringify(result.metafile));

  const { problems } = checkEntries(manifestPath, { metafile: metafilePath, dataEntries });
  if (problems.length > 0) throw new Error(`bc-check-entries failed for ${moduleDir}:\n- ${problems.join('\n- ')}`);
  return { manifestPath, metafilePath };
}
