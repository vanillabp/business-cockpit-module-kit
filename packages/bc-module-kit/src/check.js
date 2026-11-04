/**
 * The checks of `bc-check-entries`, for a module's build. Plain Node.js without dependencies.
 *
 * @module @vanillabp/bc-module-kit/check
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { DATA_ENTRIES } from './entries.js';
import { readManifest } from './manifest.js';

/** The limit of a data entry with every file it imports: 32 KB before compression. */
export const DEFAULT_LIMIT_BYTES = 32 * 1024;

/**
 * The packages whose code must not be in a data entry. The check finds them through the inputs
 * of a bundler's metafile.
 */
export const FRAMEWORK_PACKAGES = Object.freeze([
  'react', 'react-dom', 'scheduler', 'vue', '@vue/', '@angular/', 'zone.js',
  'preact', 'svelte', 'solid-js', 'lit', 'lit-html', 'lit-element', '@lit/',
]);

/**
 * Markers that framework packages leave in a bundle, also when it is minified. The check finds a
 * framework by them when there is no metafile.
 */
export const FRAMEWORK_MARKERS = Object.freeze([
  { framework: 'react', marker: '@license React' },
  { framework: 'react', marker: 'react.transitional.element' },
  { framework: 'react', marker: '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' },
  { framework: 'react', marker: '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED' },
  { framework: 'vue', marker: '__vue_app__' },
  { framework: 'vue', marker: '__v_isRef' },
  { framework: 'angular', marker: '@license Angular' },
  { framework: 'angular', marker: 'ɵɵdefineComponent' },
  { framework: 'zone.js', marker: '__zone_symbol__' },
  { framework: 'lit', marker: 'litHtmlVersions' },
]);

/**
 * Reads a size like `32kb`, `0.5mb` or `32768`. A kilobyte is 1024 bytes.
 *
 * @param {string | number} value
 * @returns {number} bytes
 */
export function parseLimit(value) {
  if (typeof value === 'number') return value;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|k|mb|m)?\s*$/i.exec(value);
  if (!match) throw new Error(`"${value}" is no size; write it like 32kb or 32768`);
  const factor = { b: 1, k: 1024, kb: 1024, m: 1024 * 1024, mb: 1024 * 1024 }[(match[2] ?? 'b').toLowerCase()];
  return Math.round(Number(match[1]) * factor);
}

/**
 * Lists the frameworks whose markers are in a source.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function findFrameworkCode(source) {
  const found = new Set();
  for (const { framework, marker } of FRAMEWORK_MARKERS) {
    if (source.includes(marker)) found.add(framework);
  }
  return [...found];
}

const STATIC_IMPORT = /(?:^|[^.\w$])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["']([^"'\n]+)["']/g;
const DYNAMIC_IMPORT = /(?:^|[^.\w$])import\s*\(\s*["']([^"'\n]+)["']\s*\)/g;

/**
 * Lists the specifiers a file imports, static and dynamic ones with a fixed string.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function importsOf(source) {
  const specifiers = new Set();
  for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

/**
 * The file part of a manifest entry, without `?v=...` and without `#...`.
 *
 * @param {string} file
 */
function pathOf(file) {
  return file.split(/[?#]/, 1)[0];
}

/**
 * Reads the inputs per output file from an esbuild metafile.
 *
 * @param {string} metafilePath
 * @returns {(file: string) => string[] | undefined} the inputs of an output file, by its absolute path
 */
function readMetafile(metafilePath) {
  const metafile = JSON.parse(readFileSync(metafilePath, 'utf8'));
  const outputs = Object.entries(metafile.outputs ?? {}).map(([output, { inputs }]) => ({
    suffix: sep + output.split('/').join(sep).replace(/^(\.\.?[\\/])+/, ''),
    inputs: Object.keys(inputs ?? {}),
  }));
  return (file) => outputs.find(({ suffix }) => file.endsWith(suffix))?.inputs;
}

/**
 * Says whether an input of a bundle comes from a framework package.
 *
 * @param {string} input
 * @returns {string | undefined} the package
 */
function frameworkOfInput(input) {
  const parts = input.split(/[\\/]node_modules[\\/]|^node_modules[\\/]/);
  if (parts.length < 2) return undefined;
  const path = parts[parts.length - 1];
  return FRAMEWORK_PACKAGES.find((name) => (name.endsWith('/') ? path.startsWith(name) : path === name || path.startsWith(`${name}/`)));
}

/**
 * Checks the entries of a manifest. Every entry must have a file. Every data entry, with every
 * file it imports, must stay below the limit, must import nothing by a bare name, and must hold no
 * framework code.
 *
 * @param {string} manifestPath
 * @param {{ limit?: number | string, dataEntries?: string[], metafile?: string }} [options]
 * @returns {{ problems: string[], dataEntries: Array<{ entry: string, files: string[], bytes: number }> }}
 */
export function checkEntries(manifestPath, options = {}) {
  const limit = parseLimit(options.limit ?? DEFAULT_LIMIT_BYTES);
  const dataEntryNames = new Set([...DATA_ENTRIES, ...(options.dataEntries ?? [])]);
  const inputsOf = options.metafile ? readMetafile(resolve(options.metafile)) : () => undefined;
  const base = dirname(resolve(manifestPath));
  const problems = [];
  const dataEntries = [];

  let manifest;
  try {
    manifest = readManifest(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { problems: [/** @type {Error} */ (error).message], dataEntries };
  }

  for (const [entry, file] of Object.entries(manifest.entries)) {
    const path = resolve(base, pathOf(file));
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`${entry}: the file ${file} does not exist`);
      continue;
    }
    if (!dataEntryNames.has(entry)) continue;

    const files = [];
    const seen = new Set();
    const queue = [path];
    while (queue.length > 0) {
      const current = /** @type {string} */ (queue.shift());
      if (seen.has(current)) continue;
      seen.add(current);
      files.push(current);
      const source = readFileSync(current, 'utf8');
      const shown = current.slice(base.length + 1);
      for (const framework of findFrameworkCode(source)) {
        problems.push(`${entry}: ${shown} contains code of ${framework}; a data entry carries no framework`);
      }
      for (const input of inputsOf(current) ?? []) {
        const framework = frameworkOfInput(input);
        if (framework) problems.push(`${entry}: ${shown} was built from ${input} of the package ${framework}; a data entry carries no framework`);
      }
      for (const specifier of importsOf(source)) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          problems.push(`${entry}: ${shown} imports "${specifier}"; an entry imports only files of its own module, by relative paths`);
          continue;
        }
        const imported = resolve(dirname(current), pathOf(specifier));
        if (!imported.startsWith(base + sep)) {
          problems.push(`${entry}: ${shown} imports ${specifier}, which lies outside the folder of the manifest`);
        } else if (!existsSync(imported)) {
          problems.push(`${entry}: ${shown} imports ${specifier}, which does not exist`);
        } else {
          queue.push(imported);
        }
      }
    }
    const bytes = files.reduce((sum, current) => sum + statSync(current).size, 0);
    if (bytes > limit) {
      problems.push(`${entry}: ${bytes} bytes with the files it imports, more than the limit of ${limit} bytes`);
    }
    dataEntries.push({ entry, files: files.map((current) => current.slice(base.length + 1)), bytes });
  }
  return { problems: [...new Set(problems)], dataEntries };
}
