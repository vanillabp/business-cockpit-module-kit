import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkEntries, findFrameworkCode, importsOf, parseLimit } from '../src/check.js';

const bin = fileURLToPath(new URL('../bin/bc-check-entries.js', import.meta.url));
const folders = [];
after(() => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); });

/** Writes a module's dist folder: files by path, and a manifest of the entries. */
function moduleDist(files, entries) {
  const folder = mkdtempSync(join(tmpdir(), 'bc-check-entries-'));
  folders.push(folder);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  writeFileSync(join(folder, 'bc-manifest.json'), JSON.stringify({ manifestVersion: 1, entries }));
  return join(folder, 'bc-manifest.json');
}

const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

describe('bc-check-entries', () => {
  it('PKG-021 passes a module whose data entries are small and plain', () => {
    const manifest = moduleDist({
      'entries/list.js': 'import{a as b}from"../chunks/shared.js";export const userTaskListColumns=()=>b;',
      'chunks/shared.js': 'export const a=[];',
      'entries/form.js': 'export const userTaskForm=()=>({entry:"Form",element:"x-form"});',
      'entries/visual.js': '/** @license React */ customElements.define("x-form", class extends HTMLElement{});',
    }, { UserTaskList: 'entries/list.js?v=1.0.0', UserTaskForm: 'entries/form.js', Form: 'entries/visual.js' });
    const result = run(manifest);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UserTaskList: \d+ bytes in 2 file\(s\)/);
    assert.match(result.stdout, /every entry is fine/);
  });

  it('PKG-021 fails when an entry the manifest names has no file', () => {
    const result = run(moduleDist({}, { Form: 'entries/missing.js' }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Form: the file entries\/missing.js does not exist/);
  });

  it('PKG-022 fails for a data entry which imports a framework, found by its markers', () => {
    const manifest = moduleDist({
      'entries/list.js': 'import"../chunks/react.js";export const userTaskListColumns=()=>[];',
      'chunks/react.js': '/** @license React react.production.js */ const x = Symbol.for("react.transitional.element");',
    }, { UserTaskList: 'entries/list.js' });
    const result = run(manifest);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UserTaskList: chunks\/react.js contains code of react/);
  });

  it('PKG-022 finds a framework through the inputs of an esbuild metafile', () => {
    const manifest = moduleDist({ 'dist/entries/list.js': 'export const userTaskListColumns=()=>[];' }, { UserTaskList: 'dist/entries/list.js' });
    const metafile = join(dirname(manifest), 'meta.json');
    writeFileSync(metafile, JSON.stringify({ outputs: { 'dist/entries/list.js': { inputs: { 'node_modules/@vue/shared/dist/shared.esm-bundler.js': {}, 'src/list.js': {} } } } }));
    const result = run(manifest, '--metafile', metafile);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /built from node_modules\/@vue\/shared.* of the package @vue\//);
  });

  it('PKG-023 fails for a data entry larger than the limit, together with the files it imports', () => {
    const manifest = moduleDist({
      'entries/form.js': 'import"./big.js";export const userTaskForm=()=>undefined;',
      'entries/big.js': `export const x="${'a'.repeat(2000)}";`,
    }, { UserTaskForm: 'entries/form.js' });
    assert.equal(run(manifest).status, 0);
    const result = run(manifest, '--limit', '1kb');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /more than the limit of 1024 bytes/);
  });

  it('checks the data entries of the cockpit\'s own extension points as well', () => {
    const manifest = moduleDist({ 'entries/menu.js': 'import "react";' }, { MenuEntries: 'entries/menu.js' });
    assert.equal(run(manifest).status, 0);
    const result = run(manifest, '--data-entry', 'MenuEntries');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /imports "react"; an entry imports only files of its own module/);
  });

  it('fails for imports outside the folder of the manifest and for missing imports', () => {
    const manifest = moduleDist({ 'entries/list.js': 'import"../../elsewhere.js";import("./later.js");' }, { UserTaskList: 'entries/list.js' });
    const { problems } = checkEntries(manifest);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /outside the folder of the manifest/);
    assert.match(problems[1], /later.js, which does not exist/);
  });

  it('fails for a manifest which breaks the format, and answers wrong options with exit code 2', () => {
    const manifest = moduleDist({}, { './UserTaskList': 'a.js' });
    assert.equal(run(manifest).status, 1);
    assert.equal(run().status, 2);
    assert.equal(run(manifest, '--unknown').status, 2);
    assert.match(execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8' }), /Usage: bc-check-entries/);
  });
});

describe('the parts of the check', () => {
  it('reads sizes in bytes, kilobytes and megabytes', () => {
    assert.equal(parseLimit('32kb'), 32768);
    assert.equal(parseLimit('32KB'), 32768);
    assert.equal(parseLimit('0.5mb'), 524288);
    assert.equal(parseLimit('1000'), 1000);
    assert.throws(() => parseLimit('a lot'));
  });

  it('finds static, re-exported, bare and dynamic imports, also when minified', () => {
    const source = 'import a from "./a.js";import{b as c}from"./b.js";export*from"./c.js";import"./d.js";const e=import("./e.js");import.meta.url;x.import("./no.js")';
    assert.deepEqual(importsOf(source).sort(), ['./a.js', './b.js', './c.js', './d.js', './e.js']);
  });

  it('knows the markers of React, Vue, Angular, zone.js and Lit', () => {
    assert.deepEqual(findFrameworkCode('a.__vue_app__=b'), ['vue']);
    assert.deepEqual(findFrameworkCode('/** @license Angular v20 */ Zone.__zone_symbol__'), ['angular', 'zone.js']);
    assert.deepEqual(findFrameworkCode('(globalThis.litHtmlVersions??=[]).push("3.3.0")'), ['lit']);
    assert.deepEqual(findFrameworkCode('export const columns = () => [];'), []);
  });
});
