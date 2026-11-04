import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BcHostError, createModuleHost } from '../src/index.js';

const manifest = {
  manifestVersion: 1,
  entries: {
    UserTaskList: 'entries/list-1.js',
    UserTaskForm: 'entries/form-1.js',
    ConfirmRideForm: 'entries/confirm-ride-1.js',
  },
};

/** A host whose fetch and import() are counted and answer from memory. */
function testHost({ manifests = { 'taxi-ride': manifest }, exports = {}, failImports = 0, failFetches = 0, ...options } = {}) {
  const fetched = [];
  const imported = [];
  let importFailures = failImports;
  let fetchFailures = failFetches;
  const warnings = [];
  const host = createModuleHost({
    baseUrl: 'https://cockpit.example.com/',
    fetch: async (url, init) => {
      fetched.push([url, init]);
      if (fetchFailures-- > 0) throw new TypeError('network down');
      const id = new URL(url).pathname.split('/')[2];
      const body = manifests[id];
      return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
    },
    importModule: async (url) => {
      imported.push(url);
      if (importFailures-- > 0) throw new TypeError('Failed to fetch dynamically imported module');
      return exports[url] ?? {};
    },
    logger: { warn: (message) => warnings.push(message), error: (message) => warnings.push(message) },
    ...options,
  });
  return { host, fetched, imported, warnings };
}

describe('the registry', () => {
  it('EXT-016 reads the modules once', async () => {
    let calls = 0;
    const { host } = testHost({ loadModules: async () => { calls += 1; return [{ id: 'taxi-ride', uri: '/wm/taxi-ride' }]; } });
    await Promise.all([host.registry.load(), host.registry.load()]);
    assert.equal(calls, 1);
    assert.deepEqual(host.registry.list().map(({ id }) => id), ['taxi-ride']);
  });

  it('EXT-019 adds a module which registered after the page loaded', async () => {
    const { host } = testHost({ loadModules: () => [], loadModule: (id) => ({ id, uri: `/wm/${id}` }) });
    await host.readManifest('taxi-ride');
    assert.equal(host.registry.get('taxi-ride').id, 'taxi-ride');
  });

  it('loads nothing for a module without a web path', async () => {
    const { host, fetched } = testHost({ modules: [{ id: 'taxi-ride', uri: '' }] });
    assert.equal(await host.loadEntry('taxi-ride', 'UserTaskList'), undefined);
    assert.equal(fetched.length, 0);
  });
});

describe('the loader', () => {
  it('EXT-025 reads the manifest below /wm/<id>/ once, with cache no-cache', async () => {
    const { host, fetched } = testHost();
    await Promise.all([host.loadEntry('taxi-ride', 'UserTaskList'), host.loadEntry('taxi-ride', 'UserTaskForm')]);
    assert.deepEqual(fetched, [['https://cockpit.example.com/wm/taxi-ride/bc-manifest.json', { cache: 'no-cache' }]]);
  });

  it('EXT-002 loads each pair of module and entry once and hands out the same promise', async () => {
    const { host, imported } = testHost();
    const first = host.loadEntry('taxi-ride', 'UserTaskList');
    assert.equal(host.loadEntry('taxi-ride', 'UserTaskList'), first);
    await first;
    await host.loadEntry('taxi-ride', 'UserTaskList');
    assert.deepEqual(imported, ['https://cockpit.example.com/wm/taxi-ride/entries/list-1.js']);
  });

  it('EXT-011 answers undefined for a module without a manifest and does not ask again', async () => {
    const { host, fetched } = testHost({ manifests: {} });
    assert.equal(await host.loadEntry('other', 'UserTaskList'), undefined);
    assert.equal(await host.loadEntry('other', 'Header'), undefined);
    assert.equal(fetched.length, 1);
  });

  it('EXT-011 answers undefined for an entry the manifest does not name', async () => {
    const { host, imported, warnings } = testHost();
    assert.equal(await host.ask('taxi-ride', 'Header', [{}]), undefined);
    assert.equal(imported.length, 0);
    assert.deepEqual(warnings, []);
  });

  it('EXT-033 a retry after a failed import reads the manifest again and imports again', async () => {
    const { host, fetched, imported } = testHost({ failImports: 1 });
    await assert.rejects(host.loadEntry('taxi-ride', 'UserTaskList'));
    await host.loadEntry('taxi-ride', 'UserTaskList');
    assert.equal(fetched.length, 2);
    assert.equal(imported.length, 2);
  });

  it('forgets a manifest that failed to load', async () => {
    const { host, fetched } = testHost({ failFetches: 1 });
    await assert.rejects(host.readManifest('taxi-ride'));
    assert.deepEqual(await host.readManifest('taxi-ride'), manifest);
    assert.equal(fetched.length, 2);
  });

  it('refuses a manifest which breaks the format', async () => {
    const { host } = testHost({ manifests: { 'taxi-ride': { manifestVersion: 2, entries: {} } } });
    await assert.rejects(host.readManifest('taxi-ride'), /only knows version 1/);
  });
});

describe('ask', () => {
  const form = 'https://cockpit.example.com/wm/taxi-ride/entries/form-1.js';

  it('calls the function the data entry exports', async () => {
    const parts = { entry: 'ConfirmRideForm', element: 'taxi-ride-confirm-ride' };
    const { host } = testHost({ exports: { [form]: { userTaskForm: (userTask) => (userTask.id === '1' ? parts : undefined) } } });
    assert.deepEqual(await host.ask('taxi-ride', 'UserTaskForm', [{ id: '1' }]), parts);
    assert.equal(await host.ask('taxi-ride', 'UserTaskForm', [{ id: '2' }]), undefined);
  });

  it('reports an export with the wrong name in the console with the module id', async () => {
    const { host, warnings } = testHost({ exports: { [form]: { userTaskFormular: () => ({}) } } });
    assert.equal(await host.ask('taxi-ride', 'UserTaskForm', [{}]), undefined);
    assert.match(warnings[0], /taxi-ride names the entry UserTaskForm, but it does not export the function userTaskForm/);
  });

  it('EXT-037 says which step failed', async () => {
    const { host } = testHost({ failImports: 1 });
    const error = await host.ask('taxi-ride', 'UserTaskForm', [{}]).catch((e) => e);
    assert.ok(error instanceof BcHostError);
    assert.equal(error.step, 'ask');
    assert.equal(error.moduleId, 'taxi-ride');
    assert.equal(error.entry, 'UserTaskForm');
  });
});

describe('entries the host does not know', () => {
  const withHeader = { ...manifest, entries: { ...manifest.entries, Header: 'entries/header-1.js' } };
  const header = 'https://cockpit.example.com/wm/taxi-ride/entries/header-1.js';
  const buttons = [{ entry: 'RideButtons', element: 'taxi-ride-new-ride' }];

  it('a host without the entry Header neither loads it nor fails, and still shows the rest of the module', async () => {
    const { host, imported, warnings } = testHost({ manifests: { 'taxi-ride': withHeader }, exports: { [header]: { header: () => buttons } } });
    assert.deepEqual(host.entries, ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage']);
    assert.equal(await host.ask('taxi-ride', 'Header', [{ id: 'anna' }]), undefined);
    await host.loadEntry('taxi-ride', 'UserTaskList');
    assert.deepEqual(imported, ['https://cockpit.example.com/wm/taxi-ride/entries/list-1.js']);
    assert.deepEqual(warnings, []);
  });

  it('a host configured with the entry Header asks it', async () => {
    const { host } = testHost({ manifests: { 'taxi-ride': withHeader }, exports: { [header]: { header: () => buttons } }, entries: { Header: 'header' } });
    assert.ok(host.entries.includes('Header'));
    assert.deepEqual(await host.ask('taxi-ride', 'Header', [{ id: 'anna' }]), buttons);
  });
});

describe('the areas of a page', () => {
  const offered = { all: 'm-all', body: 'm-body', information: 'm-information', actions: 'm-actions' };

  it('a host without areas shows the web component of all', () => {
    const { host } = testHost();
    assert.deepEqual(host.areas, []);
    assert.deepEqual(host.pickAreas(offered), { all: 'm-all' });
    assert.deepEqual(host.pickAreas('m-form'), { all: 'm-form' });
  });

  it('a host with areas shows the areas it knows, in its order, and ignores the others', () => {
    const { host } = testHost({ areas: ['actions', 'body', 'sidebar'] });
    assert.deepEqual(host.pickAreas(offered), { actions: 'm-actions', body: 'm-body' });
  });

  it('a host with areas shows the web component of all when the module offers none of its areas', () => {
    const { host } = testHost({ areas: ['body', 'actions'] });
    assert.deepEqual(host.pickAreas({ all: 'm-all', sidebar: 'm-sidebar' }), { all: 'm-all' });
    assert.deepEqual(host.pickAreas('m-form'), { all: 'm-form' });
  });

  it('shows nothing, and says why, when a module offers neither an area of the host nor all', async () => {
    const form = 'https://cockpit.example.com/wm/taxi-ride/entries/form-1.js';
    const { host, warnings, imported } = testHost({ exports: { [form]: { userTaskForm: () => ({ entry: 'ConfirmRideForm', element: { body: 'm-body' } }) } } });
    assert.deepEqual(host.pickAreas({ body: 'm-body' }), {});
    assert.equal(await host.showUserTask('taxi-ride', {}, /** @type {any} */ ({})), undefined);
    assert.match(warnings[0], /taxi-ride offers no web component for the area all in its entry UserTaskForm/);
    assert.deepEqual(imported, [form]);
  });
});

describe('the package', () => {
  it('depends on nothing but the kit', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(pkg.dependencies), ['@vanillabp/bc-module-kit']);
    assert.equal(pkg.peerDependencies, undefined);
  });
});
