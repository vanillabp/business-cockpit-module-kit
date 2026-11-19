import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { ALREADY_DEFINED, BcHostError, MANIFEST_RECHECK_MS, createModuleHost } from '../src/index.js';

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

const HTTP_NOT_MODIFIED = 304;

/**
 * A module whose server can be given a new build. The manifest carries an ETag, and a request with
 * the ETag of the current build is answered with 304.
 */
function deployedModule(build) {
  const server = { build, fetched: [], failNext: false, deploy(next) { server.build = next; } };
  const manifestOf = ({ version, timestamp, files = version }) => ({
    manifestVersion: 1,
    ...(version === undefined ? {} : { buildVersion: version }),
    ...(timestamp === undefined ? {} : { buildTimestamp: timestamp }),
    entries: { UserTaskForm: `form-${files}.js`, UserTaskList: `list-${files}.js`, ConfirmRideForm: `confirm-${files}.js` },
  });
  server.fetch = async (url, init) => {
    server.fetched.push(init);
    if (server.failNext) {
      server.failNext = false;
      throw new TypeError('network down');
    }
    const body = JSON.stringify(manifestOf(server.build));
    const etag = `"${body.length}-${server.build.version}-${server.build.files}-${server.build.timestamp}"`;
    if (init?.headers?.['if-none-match'] === etag) return new Response(null, { status: HTTP_NOT_MODIFIED, headers: { etag } });
    return new Response(body, { headers: { etag } });
  };
  return server;
}

describe('a new build of a module', () => {
  const at = (path) => `https://cockpit.example.com/wm/taxi-ride/${path}`;

  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: 0 }));
  afterEach(() => mock.timers.reset());

  function renewableHost(build, options = {}) {
    const server = deployedModule(build);
    const imported = [];
    const newBuilds = [];
    const warnings = [];
    const host = createModuleHost({
      baseUrl: 'https://cockpit.example.com/',
      modules: [{ id: 'taxi-ride', uri: '/wm/taxi-ride' }],
      fetch: server.fetch,
      importModule: async (url) => {
        imported.push(url);
        return { url };
      },
      onNewBuild: (moduleId, manifest, previous) => newBuilds.push([moduleId, previous.buildVersion, manifest.buildVersion]),
      logger: { warn: (message) => warnings.push(message), error: (message) => warnings.push(message) },
      ...options,
    });
    return { host, server, imported, newBuilds, warnings };
  }

  it('EXT-047 reads the manifest again only when its last read is older than MANIFEST_RECHECK_MS', async () => {
    const { host, server } = renewableHost({ version: '1.0.0' });
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    mock.timers.tick(MANIFEST_RECHECK_MS);
    await host.loadEntry('taxi-ride', 'UserTaskList');
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    assert.equal(server.fetched.length, 1);
    mock.timers.tick(1);
    await Promise.all([host.loadEntry('taxi-ride', 'UserTaskForm'), host.loadEntry('taxi-ride', 'UserTaskList'), host.readManifest('taxi-ride')]);
    assert.equal(server.fetched.length, 2);
    assert.equal(MANIFEST_RECHECK_MS, 60_000);
  });

  it('EXT-047 the time is an option, so a test does not wait a minute', async () => {
    const { host, server } = renewableHost({ version: '1.0.0' }, { manifestRecheckMs: 200 });
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    mock.timers.tick(201);
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    assert.equal(server.fetched.length, 2);
  });

  it('a 304 keeps the build: the host asks with the ETag it has and loads nothing again', async () => {
    const { host, server, imported, newBuilds } = renewableHost({ version: '1.0.0' });
    const first = await host.loadEntry('taxi-ride', 'UserTaskForm');
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    assert.equal(await host.loadEntry('taxi-ride', 'UserTaskForm'), first);
    assert.deepEqual(server.fetched[0], { cache: 'no-cache' });
    assert.equal(server.fetched[1].cache, 'no-cache');
    assert.match(server.fetched[1].headers['if-none-match'], /1\.0\.0/);
    assert.deepEqual(imported, [at('form-1.0.0.js')]);
    assert.deepEqual(newBuilds, []);
    // The 304 counts as a read, so the next minute asks nothing.
    mock.timers.tick(MANIFEST_RECHECK_MS);
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    assert.equal(server.fetched.length, 2);
  });

  it('EXT-048 after a new buildVersion the next part comes from the new build, and every entry of the old build is dropped', async () => {
    const { host, server, imported, newBuilds } = renewableHost({ version: '1.0.0' });
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    await host.loadEntry('taxi-ride', 'UserTaskList');
    server.deploy({ version: '1.1.0' });
    // Within the time the host does not know about the new build yet.
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskForm'), { url: at('form-1.0.0.js') });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskForm'), { url: at('form-1.1.0.js') });
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskList'), { url: at('list-1.1.0.js') });
    assert.equal((await host.readManifest('taxi-ride')).buildVersion, '1.1.0');
    assert.deepEqual(imported, [at('form-1.0.0.js'), at('list-1.0.0.js'), at('form-1.1.0.js'), at('list-1.1.0.js')]);
    assert.deepEqual(newBuilds, [['taxi-ride', '1.0.0', '1.1.0']]);
  });

  it('a new buildTimestamp with the same buildVersion is a new build as well', async () => {
    const { host, server, newBuilds } = renewableHost({ version: '1.0.0-SNAPSHOT', timestamp: '2026-11-19T08:00:00Z', files: 'a' });
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    server.deploy({ version: '1.0.0-SNAPSHOT', timestamp: '2026-11-19T09:00:00Z', files: 'b' });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskForm'), { url: at('form-b.js') });
    assert.equal(newBuilds.length, 1);
  });

  it('a manifest without buildVersion and buildTimestamp is compared by its files', async () => {
    const { host, server, newBuilds } = renewableHost({ files: 'a' });
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    server.deploy({ files: 'a' });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    assert.equal(newBuilds.length, 0);
    server.deploy({ files: 'b' });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskForm'), { url: at('form-b.js') });
    assert.equal(newBuilds.length, 1);
  });

  it('EXT-047 when reading the manifest again fails, the host goes on with the build it has and asks again next time', async () => {
    const { host, server, warnings } = renewableHost({ version: '1.0.0' });
    await host.loadEntry('taxi-ride', 'UserTaskForm');
    server.deploy({ version: '1.1.0' });
    server.failNext = true;
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskForm'), { url: at('form-1.0.0.js') });
    assert.match(warnings[0], /manifest of the module taxi-ride again failed/);
    assert.deepEqual(await host.loadEntry('taxi-ride', 'UserTaskForm'), { url: at('form-1.1.0.js') });
    assert.equal(server.fetched.length, 3);
  });
});

/** Just enough of the browser's custom element registry for `load`. */
function fakeCustomElements() {
  const defined = new Map();
  return {
    defined,
    define(name, constructor) {
      if (defined.has(name)) throw new DOMException(`the name "${name}" has already been used`, 'NotSupportedError');
      defined.set(name, constructor);
    },
    get: (name) => defined.get(name),
    whenDefined: (name) => (defined.has(name) ? Promise.resolve(defined.get(name)) : new Promise(() => {})),
  };
}

describe('load and the names of the web components', () => {
  const formOf = (files) => `https://cockpit.example.com/wm/taxi-ride/confirm-${files}.js`;
  let registry;

  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: 0 });
    registry = fakeCustomElements();
    globalThis.customElements = registry;
  });
  afterEach(() => {
    mock.timers.reset();
    delete globalThis.customElements;
  });

  /** A host whose visual entry `confirm-<files>.js` defines the web components `names[files]`. */
  function loadingHost(build, names) {
    const server = deployedModule(build);
    const imported = [];
    const errors = [];
    const host = createModuleHost({
      baseUrl: 'https://cockpit.example.com/',
      modules: [{ id: 'taxi-ride', uri: '/wm/taxi-ride' }],
      fetch: server.fetch,
      importModule: async (url) => {
        imported.push(url);
        const files = url.match(/confirm-(.+)\.js$/)?.[1];
        for (const name of names[files] ?? []) registry.define(name, class {});
        return {};
      },
      whenDefinedTimeoutMs: 50,
      logger: { warn: (message) => errors.push(message), error: (message) => errors.push(message) },
    });
    return { host, server, imported, errors };
  }

  it('EXT-046 draws at once when the current build defined every web component already', async () => {
    const { host, server, imported } = loadingHost({ version: '1.0.0' }, { '1.0.0': ['taxi-ride-a-confirm-ride'] });
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-a-confirm-ride']);
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-a-confirm-ride']);
    assert.deepEqual(imported, [formOf('1.0.0')]);
    assert.equal(server.fetched.length, 1);
  });

  it('EXT-048 loads the visual entry of a new build whose names carry the build', async () => {
    const { host, server, imported } = loadingHost({ version: '1.0.0' }, { '1.0.0': ['taxi-ride-a-confirm-ride'], '1.1.0': ['taxi-ride-b-confirm-ride'] });
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-a-confirm-ride']);
    server.deploy({ version: '1.1.0' });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-b-confirm-ride']);
    assert.deepEqual(imported, [formOf('1.0.0'), formOf('1.1.0')]);
  });

  it('EXT-049 does not load the new build when an earlier build defined the name already, and says why', async () => {
    const { host, server, imported, errors } = loadingHost({ version: '1.0.0' }, { '1.0.0': ['taxi-ride-confirm-ride'], '1.1.0': ['taxi-ride-confirm-ride'] });
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-confirm-ride']);
    server.deploy({ version: '1.1.0' });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    const error = await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-confirm-ride']).catch((e) => e);
    assert.ok(error instanceof BcHostError);
    assert.equal(error.code, ALREADY_DEFINED);
    assert.equal(error.step, 'load');
    assert.equal(error.moduleId, 'taxi-ride');
    assert.equal(error.element, 'taxi-ride-confirm-ride');
    assert.deepEqual(imported, [formOf('1.0.0')]);
    assert.match(errors[0], /taxi-ride was updated.*taxi-ride-confirm-ride.*Reload the page/);
  });

  it('EXT-049 a name the earlier build never defined loads as usual', async () => {
    const { host, server, imported } = loadingHost({ version: '1.0.0' }, { '1.0.0': ['taxi-ride-confirm-ride'], '1.1.0': ['taxi-ride-assess-risk'] });
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-confirm-ride']);
    server.deploy({ version: '1.1.0' });
    mock.timers.tick(MANIFEST_RECHECK_MS + 1);
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-assess-risk']);
    assert.deepEqual(imported, [formOf('1.0.0'), formOf('1.1.0')]);
  });

  it('a web component the entry defined but the host did not wait for is noted on its first use', async () => {
    const { host, imported } = loadingHost({ version: '1.0.0' }, { '1.0.0': ['taxi-ride-body', 'taxi-ride-all'] });
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-body']);
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-all']);
    await host.load('taxi-ride', 'ConfirmRideForm', ['taxi-ride-all']);
    assert.deepEqual(imported, [formOf('1.0.0')]);
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
