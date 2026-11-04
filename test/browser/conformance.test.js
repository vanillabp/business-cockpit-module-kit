// Runs the conformance test of dist/conformance against a small cockpit made of the reference
// host: once with areas and once without, for all three example modules. So the test a generated
// cockpit runs is proven to pass for a cockpit which keeps the contract. Run `npm run
// build:examples` and `npm run build:conformance` before; `npm run test:browser` does both.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { build } from 'esbuild';
import { startServer } from './server.js';

const root = join(import.meta.dirname, '..', '..');
const conformance = join(root, 'dist', 'conformance');
const cockpitBundle = join(import.meta.dirname, '.build', 'cockpit.js');

let server;

before(async () => {
  await build({ entryPoints: [join(import.meta.dirname, 'cockpit-page.js')], bundle: true, format: 'esm', outfile: cockpitBundle, logLevel: 'warning' });
  server = await startServer({
    files: { '/': join(import.meta.dirname, 'cockpit.html'), '/cockpit.js': cockpitBundle },
    folders: {
      '/wm/react-module/': join(conformance, 'wm', 'react-module'),
      '/wm/vue-module/': join(conformance, 'wm', 'vue-module'),
      '/wm/angular-module/': join(conformance, 'wm', 'angular-module'),
    },
  });
});

after(async () => {
  await server?.close();
});

/** Runs the conformance test in its own Node.js and counts its results. */
function runConformance(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', 'cockpit.test.js'], {
      cwd: conformance,
      // Without NODE_TEST_CONTEXT, the inner test runner does not take itself for a child of this one.
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, ...env },
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(output)?.[1]);
      resolve({ status, pass: count('pass'), fail: count('fail'), output });
    });
  });
}

describe('the conformance test for a generated cockpit', () => {
  it('passes for a cockpit with areas and for one without, in React, Vue and Angular', async () => {
    const result = await runConformance({
      BC_COCKPIT_URL: server.url,
      BC_USER_TASK_PAGES: [
        'react-module=/?module=react-module&areas=body,actions',
        'react-module=/?module=react-module',
        'vue-module=/?module=vue-module&areas=body,information,actions',
        'vue-module=/?module=vue-module&refuse',
        'angular-module=/?module=angular-module&areas=body,actions',
        'angular-module=/?module=angular-module',
      ].join(' '),
    });
    assert.equal(result.status, 0, result.output);
    assert.equal(result.fail, 0, result.output);
    // One check of the pages, and six checks for each of the six pages.
    assert.equal(result.pass, 1 + 6 * 6, result.output);
    assert.match(result.output, /shown as the area all/);
    assert.match(result.output, /shown as the areas of the page/);
  });

  it('fails and says what to set when it does not know a page', async () => {
    const result = await runConformance({ BC_COCKPIT_URL: server.url, BC_USER_TASK_PAGES: '' });
    assert.equal(result.status, 1);
    assert.match(result.output, /set BC_USER_TASK_PAGES/);
  });
});
