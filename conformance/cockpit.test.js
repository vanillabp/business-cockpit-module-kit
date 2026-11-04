// The conformance test of a generated cockpit: a module built against the kit loads in your
// cockpit. It opens the page of a user task of an example module (React, Vue and Angular) in your
// cockpit and works with the form the way a user does. It passes for a cockpit with areas and for
// one without, because the example modules offer both.
//
// Before you run it:
// 1. Serve the folder wm/ (`node serve.mjs`) and register the workflow modules react-module,
//    vue-module and angular-module in your cockpit, with the addresses serve.mjs prints.
// 2. Create a user task of each module with bpmnProcessId 'TaxiRide' and taskDefinition
//    'confirmRide', and find the address of its page in your cockpit.
// 3. Run it:
//    BC_COCKPIT_URL=http://localhost:8080 \
//    BC_USER_TASK_PAGES="react-module=/tasks/4711 vue-module=/tasks/4712 angular-module=/tasks/4713" \
//    node --test cockpit.test.js
//
// BC_STORAGE_STATE names a file with a logged-in session, as Playwright's storageState writes it.
// BC_CHROMIUM_PATH names a Chromium of your own.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const FRAMEWORKS = { 'react-module': 'React', 'vue-module': 'Vue', 'angular-module': 'Angular' };
const cockpitUrl = process.env.BC_COCKPIT_URL;
const pages = (process.env.BC_USER_TASK_PAGES ?? '').split(/\s+/).filter(Boolean).map((pair) => {
  const at = pair.indexOf('=');
  return { moduleId: pair.slice(0, at), path: pair.slice(at + 1) };
});

/** Waits for a check in the browser, at most ten seconds. */
const TIMEOUT = 10_000;

describe('a module built against the kit loads in your cockpit', { skip: cockpitUrl ? false : 'set BC_COCKPIT_URL to run it' }, () => {
  let browser;

  before(async () => {
    browser = await chromium.launch(process.env.BC_CHROMIUM_PATH ? { executablePath: process.env.BC_CHROMIUM_PATH } : {});
  });

  after(async () => {
    await browser?.close();
  });

  it('knows the pages of the user tasks to open', () => {
    assert.ok(pages.length > 0, 'set BC_USER_TASK_PAGES, for example "react-module=/tasks/4711 vue-module=/tasks/4712 angular-module=/tasks/4713"');
    for (const { moduleId, path } of pages) {
      assert.ok(FRAMEWORKS[moduleId], `${moduleId} is no example module; use react-module, vue-module or angular-module`);
      assert.ok(path, `${moduleId} has no page; write it like ${moduleId}=/tasks/4711`);
    }
  });

  for (const { moduleId, path } of pages) {
    const framework = FRAMEWORKS[moduleId];

    describe(`the ${framework} module on ${path}`, () => {
      let context;
      let page;
      const pageErrors = [];
      const requested = [];
      const inForm = (testId) => page.locator(`[data-test="${testId}"]`);

      before(async () => {
        context = await browser.newContext(process.env.BC_STORAGE_STATE ? { storageState: process.env.BC_STORAGE_STATE } : {});
        page = await context.newPage();
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('request', (request) => requested.push(new URL(request.url()).pathname));
        await page.goto(new URL(path, cockpitUrl).href);
      });

      after(async () => {
        await context?.close();
      });

      it('EXT-025 reads the manifest of the module below /wm/<id>/', async () => {
        await inForm('framework').waitFor({ timeout: TIMEOUT });
        assert.ok(requested.some((p) => p.endsWith(`/wm/${moduleId}/bc-manifest.json`)), requested.join(', '));
      });

      it('EXT-005 shows the form in an open shadow root, as the area all or as areas of the page', async (t) => {
        await inForm('framework').filter({ hasText: framework }).waitFor({ timeout: TIMEOUT });
        const shown = await inForm('framework').evaluate((element) => {
          const root = element.getRootNode();
          return { mode: root.mode, host: root.host?.localName, area: root.host?.area };
        });
        assert.equal(shown.mode, 'open');
        assert.ok(shown.host?.startsWith(`${moduleId}-confirm-ride`), `the form is in ${shown.host}`);
        if (shown.area === 'all') assert.equal(shown.host, `${moduleId}-confirm-ride`);
        else assert.equal(shown.host, `${moduleId}-confirm-ride-body`);
        t.diagnostic(`shown as ${shown.area === 'all' ? 'the area all' : 'the areas of the page'}`);
      });

      it('TF-016 enables Complete once the comment is filled in, also across areas', async () => {
        assert.equal(await inForm('complete').isDisabled(), true);
        await inForm('comment').pressSequentially('ok');
        await page.locator('[data-test="complete"]:not([disabled])').waitFor({ timeout: TIMEOUT });
      });

      it('EXT-007 answers userTask.claim through the event protocol', async () => {
        await inForm('claim').click();
        await inForm('state').filter({ hasText: /^(claimed|failed: .+)$/ }).waitFor({ timeout: TIMEOUT });
        const state = await inForm('state').textContent();
        assert.match(state, /^(claimed|failed: (REFUSED|FAILED))$/, 'the cockpit answers a claim with success, REFUSED or FAILED');
      });

      it('EXT-018 EXT-039 opens a dialog and resolves with what it closed with', async () => {
        await inForm('dialog').click();
        await inForm('dialog-data').filter({ hasText: 'actions' }).waitFor({ timeout: TIMEOUT });
        await inForm('close').click();
        await inForm('state').filter({ hasText: `dialog: closed by ${framework}` }).waitFor({ timeout: TIMEOUT });
      });

      it('ran without an error in the page', () => {
        assert.deepEqual(pageErrors, []);
      });
    });
  }
});
