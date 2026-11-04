// The browser test: the reference host loads the same example module, written in React, in Vue
// and in Angular, side by side in Chromium. Run `npm run build:examples` before; `npm run
// test:browser` does both.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { findFrameworkCode } from '@vanillabp/bc-module-kit/check';
import { startServer } from './server.js';

const root = join(import.meta.dirname, '..', '..');
const examples = join(root, 'examples');
const hostBundle = join(import.meta.dirname, '.build', 'host.js');

/** The three example modules: module id, the id of its page in index.html and its framework. */
const MODULES = [
  { moduleId: 'react-module', name: 'react', framework: 'React' },
  { moduleId: 'vue-module', name: 'vue', framework: 'Vue' },
  { moduleId: 'angular-module', name: 'angular', framework: 'Angular' },
];

const userTask = (id) => ({ id, title: `Confirm ride ${id}`, bpmnProcessId: 'TaxiRide', taskDefinition: 'confirmRide' });

let server;
let browser;

before(async () => {
  await build({ entryPoints: [join(import.meta.dirname, 'page.js')], bundle: true, format: 'esm', outfile: hostBundle, logLevel: 'warning' });
  server = await startServer({
    files: { '/': join(import.meta.dirname, 'index.html'), '/host.js': hostBundle },
    folders: {
      '/wm/react-module/': join(examples, 'react-module', 'dist'),
      '/wm/vue-module/': join(examples, 'vue-module', 'dist'),
      '/wm/angular-module/': join(examples, 'angular-module', 'dist'),
    },
    virtual: {
      // A module whose visual entry never defines the web component its data entry names.
      '/wm/slow-module/bc-manifest.json': JSON.stringify({ manifestVersion: 1, entries: { UserTaskForm: 'form.js', SlowForm: 'slow.js' } }),
      '/wm/slow-module/form.js': 'export const userTaskForm = () => ({ entry: "SlowForm", element: "slow-module-form" });',
      '/wm/slow-module/slow.js': '// defines nothing',
    },
  });
  browser = await chromium.launch(process.env.BC_CHROMIUM_PATH ? { executablePath: process.env.BC_CHROMIUM_PATH } : {});
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/** Opens the test page and waits for the host. By default the host has the areas body and actions. */
async function openPage(query = '?areas=body,actions') {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(`${server.url}/${query}`);
  await page.waitForFunction(() => window.bcTest !== undefined);
  return { page, consoleErrors };
}

/** Waits until a locator shows a text, at most five seconds. */
async function assertText(locator, expected) {
  try {
    await locator.filter({ hasText: expected }).waitFor({ timeout: 5000 });
  } catch {
    assert.equal(await locator.textContent(), expected);
  }
}

/** Reads a text inside the shadow root of the web component of a page area. */
function shadowText(page, pageId, area, testId) {
  return page.locator(`#${pageId} [data-bc-area="${area}"] [data-test="${testId}"]`);
}

describe('the reference host in Chromium', () => {
  it('EXT-034 loading the data entries of all three modules fetches no file of their frameworks', async () => {
    const { page } = await openPage();
    const answers = await page.evaluate(async ([task, moduleIds]) => {
      const { host } = window.bcTest;
      const result = {};
      for (const moduleId of moduleIds) {
        result[moduleId] = {
          columns: await host.ask(moduleId, 'UserTaskList', [task]),
          form: await host.ask(moduleId, 'UserTaskForm', [task]),
        };
      }
      return result;
    }, [userTask('1'), MODULES.map(({ moduleId }) => moduleId)]);
    assert.equal(answers['react-module'].columns[0].path, 'details.customer');
    assert.equal(answers['angular-module'].columns[0].path, 'details.customer');
    assert.deepEqual(answers['vue-module'].form, {
      entry: 'ConfirmRideForm',
      element: { all: 'vue-module-confirm-ride', body: 'vue-module-confirm-ride-body', actions: 'vue-module-confirm-ride-actions' },
    });
    assert.deepEqual(answers['angular-module'].form.element.all, 'angular-module-confirm-ride');

    const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map(({ name }) => new URL(name).pathname).filter((path) => path.startsWith('/wm/')));
    const scripts = loaded.filter((path) => path.endsWith('.js'));
    assert.ok(scripts.length >= 6, loaded.join(', '));
    assert.ok(!scripts.some((path) => path.includes('ConfirmRideForm')), loaded.join(', '));
    for (const path of scripts) {
      const [, , moduleId, ...rest] = path.split('/');
      const source = readFileSync(join(examples, moduleId, 'dist', ...rest), 'utf8');
      assert.deepEqual(findFrameworkCode(source), [], path);
    }
    await page.close();
  });

  it('EXT-029 EXT-005 shows the React, the Vue and the Angular form side by side, each in its own shadow DOM', async () => {
    const { page, consoleErrors } = await openPage();
    const areas = await page.evaluate(async (shown) => Promise.all(
      shown.map(([moduleId, task, containerId]) => window.bcTest.show(moduleId, task, containerId)),
    ), MODULES.map(({ moduleId, name }, index) => [moduleId, userTask(String(index + 1)), `${name}-page`]));
    assert.deepEqual(areas, [['body', 'actions'], ['body', 'actions'], ['body', 'actions']]);

    for (const [index, { name, framework }] of MODULES.entries()) {
      assert.equal(await shadowText(page, `${name}-page`, 'body', 'framework').textContent(), framework);
      assert.equal(await shadowText(page, `${name}-page`, 'body', 'title').textContent(), `Confirm ride ${index + 1}`);
    }

    const shadow = await page.evaluate(() => [...document.querySelectorAll('main [data-bc-area] > *')].map((element) => [element.localName, element.shadowRoot?.mode, element.area]));
    assert.deepEqual(shadow, MODULES.flatMap(({ moduleId }) => [
      [`${moduleId}-confirm-ride-body`, 'open', 'body'],
      [`${moduleId}-confirm-ride-actions`, 'open', 'actions'],
    ]));
    const color = (locator) => locator.evaluate((element) => getComputedStyle(element).color);
    for (const { name } of MODULES) {
      assert.equal(await color(shadowText(page, `${name}-page`, 'body', 'framework')), 'rgb(200, 0, 0)');
      assert.equal(await color(shadowText(page, `${name}-page`, 'actions', 'claim')), 'rgb(200, 0, 0)');
    }
    assert.equal(await color(page.locator('#outside')), 'rgb(0, 0, 255)');
    // No module puts a style into the page itself, so nothing can leak out of a shadow DOM.
    assert.equal(await page.evaluate(() => document.querySelectorAll('style').length), 1);
    assert.deepEqual(consoleErrors, []);
    await page.close();
  });

  it('EXT-030 fetches every file of a module at most once, however many of its parts are shown', async () => {
    const { page } = await openPage();
    const before = server.requests.length;
    await page.evaluate(async (task) => {
      await window.bcTest.host.ask('react-module', 'UserTaskList', [task]);
      await window.bcTest.show('react-module', task, 'react-page');
      await window.bcTest.host.ask('react-module', 'UserTaskList', [task]);
    }, userTask('1'));
    const fetched = server.requests.slice(before);
    assert.deepEqual(fetched.filter((path, index) => fetched.indexOf(path) !== index), []);
    assert.ok(fetched.includes('/wm/react-module/bc-manifest.json'));
    await page.close();
  });

  for (const { moduleId, name, framework } of MODULES) {
    const pageId = `${name}-page`;
    it(`carries a message from body to actions, and claims through the event protocol, in ${framework}`, async () => {
      const { page } = await openPage();
      await page.evaluate(async ([id, task, container]) => window.bcTest.show(id, task, container), [moduleId, userTask('7'), pageId]);
      const complete = shadowText(page, pageId, 'actions', 'complete');
      assert.equal(await complete.isDisabled(), true);
      await shadowText(page, pageId, 'body', 'comment').pressSequentially('ok');
      await page.waitForFunction(([selector]) => !document.querySelector(selector).shadowRoot.querySelector('[data-test="complete"]').disabled, [`#${pageId} [data-bc-area="actions"] > *`]);

      await shadowText(page, pageId, 'actions', 'claim').click();
      await page.waitForFunction(() => window.bcTest.notifications.length === 1);
      await assertText(shadowText(page, pageId, 'actions', 'state'), 'claimed');
      assert.deepEqual(await page.evaluate(() => window.bcTest.calls), [{ action: 'userTask.claim', moduleId, area: 'actions', userTaskId: '7' }]);
      assert.deepEqual(await page.evaluate(() => window.bcTest.notifications), [{ moduleId, level: 'success', text: 'Claimed', sticky: false }]);
      await page.close();
    });

    it(`EXT-018 EXT-039 opens a dialog and resolves with what it closed with, in ${framework}`, async () => {
      const { page, consoleErrors } = await openPage();
      await page.evaluate(async ([id, task, container]) => window.bcTest.show(id, task, container), [moduleId, userTask('8'), pageId]);
      await shadowText(page, pageId, 'actions', 'dialog').click();
      const dialog = page.locator(`dialog[data-bc-dialog="${moduleId}-confirm-ride-dialog"]`);
      assert.equal(await dialog.locator('[data-test="dialog-data"]').textContent(), 'actions');
      await dialog.locator('[data-test="close"]').click();
      await page.waitForFunction(() => document.querySelector('dialog') === null);
      await assertText(shadowText(page, pageId, 'actions', 'state'), `dialog: closed by ${framework}`);
      assert.deepEqual(consoleErrors, []);
      await page.close();
    });
  }

  it('a host without areas shows the web component of all, in React, Vue and Angular', async () => {
    const { page, consoleErrors } = await openPage('');
    const areas = await page.evaluate(async (shown) => Promise.all(
      shown.map(([moduleId, task, containerId]) => window.bcTest.show(moduleId, task, containerId)),
    ), MODULES.map(({ moduleId, name }, index) => [moduleId, userTask(String(index + 3)), `${name}-all`]));
    assert.deepEqual(areas, [['all'], ['all'], ['all']]);
    const shown = await page.evaluate(() => [...document.querySelectorAll('#react-all > *, #vue-all > *, #angular-all > *')].map((element) => [element.localName, element.shadowRoot?.mode, element.area]));
    assert.deepEqual(shown, MODULES.map(({ moduleId }) => [`${moduleId}-confirm-ride`, 'open', 'all']));
    for (const { name, framework } of MODULES) {
      const pageId = `${name}-all`;
      const inForm = (testId) => page.locator(`#${pageId} [data-test="${testId}"]`);
      assert.equal(await inForm('framework').textContent(), framework);
      assert.equal(await inForm('complete').isDisabled(), true);
      await inForm('comment').pressSequentially('ok');
      await page.locator(`#${pageId} [data-test="complete"]:not([disabled])`).waitFor({ timeout: 5000 });
      await inForm('claim').click();
      await assertText(inForm('state'), 'claimed');
    }
    assert.deepEqual(consoleErrors, []);
    await page.close();
  });

  it('a host with the areas body, information and actions shows body and actions, and ignores all', async () => {
    const { page } = await openPage('?areas=body,information,actions');
    for (const { moduleId, name } of MODULES) {
      const areas = await page.evaluate(async ([id, task, container]) => window.bcTest.show(id, task, container), [moduleId, userTask('5'), `${name}-page`]);
      assert.deepEqual(areas, ['body', 'actions']);
      assert.equal(await page.locator(`${moduleId}-confirm-ride`).count(), 0);
    }
    await page.close();
  });

  it('a host which does not know the entry Header ignores it, and a host which knows it shows the buttons', async () => {
    const without = await openPage('');
    const before = server.requests.length;
    const ignored = await without.page.evaluate(async ([task, shown]) => Promise.all(shown.map(async ([moduleId, containerId]) => [
      await window.bcTest.showHeader(moduleId, 'header'),
      await window.bcTest.show(moduleId, task, containerId),
    ])), [userTask('6'), MODULES.map(({ moduleId, name }) => [moduleId, `${name}-all`])]);
    assert.deepEqual(ignored, MODULES.map(() => [undefined, ['all']]));
    assert.deepEqual(server.requests.slice(before).filter((path) => /Header/.test(path)), []);
    assert.deepEqual(without.consoleErrors, []);
    await without.page.close();

    const withHeader = await openPage('?header');
    const shown = await withHeader.page.evaluate(async (moduleIds) => Promise.all(
      moduleIds.map((moduleId) => window.bcTest.showHeader(moduleId, 'header')),
    ), MODULES.map(({ moduleId }) => moduleId));
    assert.deepEqual(shown, MODULES.map(({ moduleId }) => [`${moduleId}-new-ride`]));
    const buttons = withHeader.page.locator('#header [data-test="new-ride"]');
    await buttons.nth(MODULES.length - 1).waitFor({ timeout: 5000 });
    assert.deepEqual(await buttons.allTextContents(), MODULES.map(() => 'New ride for anna'));
    await withHeader.page.close();
  });

  it('EXT-007 EXT-008 EXT-009 answers every request once, with UNKNOWN_ACTION, REFUSED or NO_TARGET where they apply', async () => {
    const { page } = await openPage();
    await page.evaluate(async (task) => window.bcTest.show('vue-module', task, 'vue-page'), userTask('9'));
    const body = '#vue-page [data-bc-area="body"] > *';
    const answers = await page.evaluate(async (selector) => {
      const { rawRequest } = window.bcTest;
      return [
        await rawRequest(selector, 'foo.bar', {}),
        await rawRequest(selector, 'userTask.unclaim', { userTaskId: '9' }),
        await rawRequest(selector, 'page.sendTo', { target: 'nowhere', message: 1 }),
        await rawRequest(selector, 'page.sendTo', { target: 'actions', message: { valid: true } }),
      ];
    }, body);
    assert.deepEqual(answers.map(({ ok, error }) => (ok ? 'ok' : [error.code, error.status])), [
      ['UNKNOWN_ACTION', undefined],
      ['REFUSED', 409],
      ['NO_TARGET', undefined],
      'ok',
    ]);
    await page.close();
  });

  it('EXT-036 names the module, the entry and the web component which was not defined in time', async () => {
    const { page } = await openPage('?whenDefined=300');
    const error = await page.evaluate(async (task) => window.bcTest.show('slow-module', task, 'slow-page').then(
      () => undefined,
      (e) => ({ name: e.name, step: e.step, moduleId: e.moduleId, entry: e.entry, element: e.element }),
    ), userTask('1'));
    assert.deepEqual(error, { name: 'BcHostError', step: 'load', moduleId: 'slow-module', entry: 'SlowForm', element: 'slow-module-form' });
    const errors = await page.evaluate(() => window.bcTest.errors);
    assert.match(errors[0], /slow-module did not define the web component slow-module-form within 300 ms/);
    await page.close();
  });
});
