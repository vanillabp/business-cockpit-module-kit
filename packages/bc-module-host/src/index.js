/**
 * A minimal host for the parts of workflow modules. It does what a cockpit does to load them:
 * a registry of modules, one loader that reads the manifests and calls import(), the three steps
 * ask, load and draw, and the cockpit's side of the event protocol. It is a reference for tests,
 * not a cockpit: it has no lists, no routing and no login.
 *
 * By default it is a cockpit with the minimum of the contract: the four entries of the kit and
 * the area `all`. Options add entries like `Header` and areas like `body` and `actions`. Entries
 * and areas the host does not know are ignored, without an error.
 *
 * @module @vanillabp/bc-module-host
 */

import {
  ACTIONS,
  AREA_ALL,
  ERROR_CODES,
  EXPORT_NAMES,
  MANIFEST_FILE_NAME,
  MESSAGE_EVENT,
  REQUEST_EVENT,
  RESPONSE_EVENT,
  USER_TASK_FORM,
  WORKFLOW_PAGE,
  elementPrefix,
  entryUrl,
  readManifest,
} from '@vanillabp/bc-module-kit';

/** How long the host waits for a web component to be defined, in milliseconds. */
export const DEFAULT_WHEN_DEFINED_TIMEOUT_MS = 10_000;

/**
 * How long the host uses a manifest before it reads it again, in milliseconds. It reads it again
 * only before it asks a part of the module, so a module nobody uses is not asked at all.
 */
export const MANIFEST_RECHECK_MS = 60_000;

/**
 * The code of a `BcHostError` thrown because an earlier build of the module defined a web
 * component in this page already. Only a reload of the page shows the new build of such a module.
 */
export const ALREADY_DEFINED = 'ALREADY_DEFINED';

/**
 * The code of a `BcHostError` thrown because a module names a web component the host refuses: the
 * name is no valid name of a custom element, it does not start with the prefix of its module and a
 * hyphen, or it starts with the longer prefix of another module of the registry.
 */
export const WRONG_ELEMENT_NAME = 'WRONG_ELEMENT_NAME';

/** Names the HTML standard does not allow for a custom element, although they have a hyphen. */
const RESERVED_ELEMENT_NAMES = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

/** The characters the HTML standard allows in the name of a custom element after its first letter. */
const ELEMENT_NAME_CHAR = '[-.0-9_a-z\\u00B7\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u203F-\\u2040\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}]';
const VALID_ELEMENT_NAME = new RegExp(`^[a-z]${ELEMENT_NAME_CHAR}*-${ELEMENT_NAME_CHAR}*$`, 'u');

/** Whether the HTML standard allows `name` as the name of a custom element. */
function isValidElementName(name) {
  return typeof name === 'string' && VALID_ELEMENT_NAME.test(name) && !RESERVED_ELEMENT_NAMES.has(name);
}

const HTTP_NOT_MODIFIED = 304;
const HTTP_NOT_FOUND = 404;

/** A step of ask, load and draw that failed. */
export class BcHostError extends Error {
  /**
   * @param {{ step: 'ask' | 'load' | 'draw', moduleId: string, entry?: string, element?: string, code?: string, message: string, cause?: unknown }} details
   */
  constructor({ step, moduleId, entry, element, code, message, cause }) {
    super(message, { cause });
    this.name = 'BcHostError';
    this.step = step;
    this.moduleId = moduleId;
    this.entry = entry;
    this.element = element;
    this.code = code;
  }
}

/** An error an action handler throws to answer with `REFUSED` and an HTTP status. */
export class BcRefusedError extends Error {
  /**
   * @param {number} status
   * @param {string} [message]
   */
  constructor(status, message) {
    super(message ?? `refused with HTTP status ${status}`);
    this.name = 'BcRefusedError';
    this.code = ERROR_CODES.REFUSED;
    this.status = status;
  }
}

/**
 * Creates a host.
 *
 * @param {import('./index.js').ModuleHostOptions} [options]
 * @returns {import('./index.js').ModuleHost}
 */
export function createModuleHost(options = {}) {
  const {
    baseUrl = globalThis.location?.href,
    fetch: fetchFn = globalThis.fetch?.bind(globalThis),
    importModule = (url) => import(/* @vite-ignore */ /* webpackIgnore: true */ url),
    loadModules,
    loadModule,
    whenDefinedTimeoutMs = DEFAULT_WHEN_DEFINED_TIMEOUT_MS,
    manifestRecheckMs = MANIFEST_RECHECK_MS,
    onNewBuild,
    actions = {},
    logger = globalThis.console,
    dialogContainer,
    entries: extraEntries = {},
    areas: pageAreas = [],
  } = options;

  /** @type {Record<string, string>} data entry -> the name of the function it exports */
  const knownEntries = { ...EXPORT_NAMES, ...extraEntries };

  /** @type {Map<string, { id: string, uri?: string, version?: string }>} */
  const modules = new Map((options.modules ?? []).map((module) => [module.id, module]));
  let registryLoaded = options.modules ? Promise.resolve() : undefined;

  const manifestUrlOf = (moduleId) => new URL(`/wm/${encodeURIComponent(moduleId)}/${MANIFEST_FILE_NAME}`, baseUrl).href;

  const registry = {
    /** Reads the modules once, like `GET /gui/api/v1/workflow-module`. */
    load() {
      registryLoaded ??= Promise.resolve(loadModules?.() ?? []).then((list) => {
        for (const module of list) modules.set(module.id, module);
      });
      return registryLoaded;
    },
    list: () => [...modules.values()],
    get: (moduleId) => modules.get(moduleId),
    /** Adds a module which registered after the page loaded, like `GET /gui/api/v1/workflow-module/{id}`. */
    async ensure(moduleId) {
      await registry.load();
      if (!modules.has(moduleId) && loadModule) {
        const module = await loadModule(moduleId);
        if (module) modules.set(module.id, module);
      }
      return modules.get(moduleId);
    },
  };

  /**
   * What the loader holds for one module: the manifest it loads from, when it read it last, the
   * read that runs now, and the promises of the entries of the current build.
   *
   * @typedef {{ manifest: any, url: string, etag?: string, lastModified?: string, build: string }} ManifestRead
   * @typedef {{
   *   current?: ManifestRead,
   *   readAt: number,
   *   missing: boolean,
   *   reading?: Promise<ManifestRead | undefined>,
   *   waiting: Map<string, Promise<any>>,
   *   entries: Map<string, Promise<any>>,
   *   earlierBuilds: Set<string>,
   * }} ModuleState
   */

  /** @type {Map<string, ModuleState>} */
  const moduleStates = new Map();
  /** @type {Map<string, string>} web component -> the module and build which defined it, as `<module>\n<build>` */
  const definedBy = new Map();

  function stateOf(moduleId) {
    let state = moduleStates.get(moduleId);
    if (!state) {
      state = { readAt: -Infinity, missing: false, waiting: new Map(), entries: new Map(), earlierBuilds: new Set() };
      moduleStates.set(moduleId, state);
    }
    return state;
  }

  /**
   * Says which build a manifest belongs to. `buildVersion` alone is not enough, because a version
   * like `1.4.0-SNAPSHOT` stays the same over many builds, so `buildTimestamp` counts as well. A
   * manifest with neither is told apart by its files, which carry the hash of their content.
   */
  function buildOf(manifest) {
    const { buildVersion, buildTimestamp, entries } = manifest;
    if (buildVersion !== undefined || buildTimestamp !== undefined) return JSON.stringify([buildVersion, buildTimestamp]);
    return JSON.stringify(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /**
   * Reads the manifest of a module and keeps it. A module without a manifest (404) has no parts,
   * and the host does not ask again. When the first read fails, it is forgotten, so the next call
   * asks again. When a later read fails, the host goes on with the manifest it has and asks again
   * the next time.
   *
   * @param {string} moduleId
   * @param {ModuleState} state
   * @returns {Promise<ManifestRead | undefined>}
   */
  function readManifestNow(moduleId, state) {
    const url = manifestUrlOf(moduleId);
    const previous = state.current;
    const keepPrevious = (problem) => {
      logger?.warn?.(`Reading the manifest of the module ${moduleId} again failed (${problem}), so the host goes on with the build it has`);
      return previous;
    };
    state.waiting = new Map();
    const reading = (async () => {
      if (!previous) {
        const module = await registry.ensure(moduleId);
        if (module && module.uri === '') {
          state.missing = true;
          return undefined;
        }
      }
      // A browser asks again with the ETag of its cache by itself. A fetch without a cache, as in
      // Node.js, gets the 304 only when the host names the version it has.
      const conditions = {
        ...(previous?.etag ? { 'if-none-match': previous.etag } : {}),
        ...(previous?.lastModified ? { 'if-modified-since': previous.lastModified } : {}),
      };
      const init = Object.keys(conditions).length > 0 ? { cache: 'no-cache', headers: conditions } : { cache: 'no-cache' };
      let response;
      try {
        response = await fetchFn(url, init);
      } catch (error) {
        if (previous) return keepPrevious(error?.message ?? error);
        throw error;
      }
      if (previous && response.status === HTTP_NOT_MODIFIED) {
        state.readAt = Date.now();
        return previous;
      }
      if (!previous && response.status === HTTP_NOT_FOUND) {
        state.missing = true;
        return undefined;
      }
      if (!response.ok) {
        const problem = `${url} answered with HTTP status ${response.status}`;
        if (previous) return keepPrevious(problem);
        throw new Error(problem);
      }
      let manifest;
      try {
        manifest = readManifest(await response.text());
      } catch (error) {
        if (previous) return keepPrevious(error.message);
        throw error;
      }
      const read = {
        manifest,
        url,
        etag: response.headers?.get?.('etag') ?? undefined,
        lastModified: response.headers?.get?.('last-modified') ?? undefined,
        build: buildOf(manifest),
      };
      if (previous && previous.build !== read.build) {
        // A new build: everything loaded from the old one is dropped. Parts already on the page stay.
        state.entries = new Map();
        state.earlierBuilds.add(previous.build);
      }
      state.current = read;
      state.readAt = Date.now();
      if (previous && previous.build !== read.build) onNewBuild?.(moduleId, read.manifest, previous.manifest);
      return read;
    })();
    state.reading = reading;
    reading.then(
      () => { state.reading = undefined; },
      () => { state.reading = undefined; },
    );
    return reading;
  }

  /**
   * Returns the read of the manifest which runs now, or starts one when the module was never read
   * or its last read is older than `manifestRecheckMs`. Returns `undefined` when the manifest the
   * host has is recent enough.
   *
   * @param {string} moduleId
   * @param {ModuleState} state
   */
  function refreshManifest(moduleId, state) {
    if (state.missing) return undefined;
    if (state.reading) return state.reading;
    if (state.current && Date.now() - state.readAt <= manifestRecheckMs) return undefined;
    return readManifestNow(moduleId, state);
  }

  /** The manifest of a module, read again first when that is due. */
  function readManifestOf(moduleId) {
    const state = stateOf(moduleId);
    return refreshManifest(moduleId, state) ?? Promise.resolve(state.current);
  }

  /**
   * Imports an entry of the build the host has now, once. The promise goes into the map in the
   * same synchronous step as import(), so every caller gets the same pending promise. A failed
   * import is forgotten, and the next call reads the manifest again first.
   *
   * @param {ModuleState} state
   * @param {string} entry
   * @param {ManifestRead | undefined} read
   */
  function importEntry(state, entry, read) {
    if (!read) return Promise.resolve(undefined);
    let promise = state.entries.get(entry);
    if (!promise) {
      const url = entryUrl(read.manifest, entry, read.url);
      if (!url) return Promise.resolve(undefined);
      const entries = state.entries;
      promise = (async () => importModule(url))();
      entries.set(entry, promise);
      promise.catch(() => {
        if (entries.get(entry) === promise) entries.delete(entry);
        state.readAt = -Infinity;
      });
    }
    return promise;
  }

  /**
   * Loads an entry of a module once per build and returns its exports, or `undefined` when the
   * module's manifest does not name it. Before it does, it reads the manifest again when its last
   * read is older than `manifestRecheckMs`. A failed load is forgotten, so a retry reads the
   * manifest again and calls import() again.
   *
   * @param {string} moduleId
   * @param {string} entry
   */
  function loadEntry(moduleId, entry) {
    const state = stateOf(moduleId);
    const reading = refreshManifest(moduleId, state);
    if (!reading) return importEntry(state, entry, state.current);
    // Callers which come while the manifest is read share one promise per entry as well.
    const waiting = state.waiting;
    let promise = waiting.get(entry);
    if (!promise) {
      promise = reading.then((read) => importEntry(state, entry, read));
      waiting.set(entry, promise);
    }
    return promise;
  }

  /**
   * Step one: ask a data entry. Calls its function with the arguments and returns the answer, or
   * `undefined` when the module does not name the entry or does not export the function. An entry
   * this host does not know is not loaded at all, and the answer is `undefined` as well.
   *
   * @param {string} moduleId
   * @param {string} entry a data entry, for example `UserTaskForm`
   * @param {unknown[]} args
   */
  async function ask(moduleId, entry, args = []) {
    const exportName = knownEntries[entry];
    if (exportName === undefined) return undefined;
    let exports;
    try {
      exports = await loadEntry(moduleId, entry);
    } catch (cause) {
      throw new BcHostError({ step: 'ask', moduleId, entry, message: `The data entry ${entry} of the module ${moduleId} failed to load`, cause });
    }
    if (!exports) return undefined;
    const fn = exports[exportName];
    if (typeof fn !== 'function') {
      logger?.warn?.(`The module ${moduleId} names the entry ${entry}, but it does not export the function ${exportName}`);
      return undefined;
    }
    return fn(...args);
  }

  /** Waits for a web component, at most `whenDefinedTimeoutMs`. */
  function whenDefined(name) {
    let timer;
    return Promise.race([
      customElements.whenDefined(name).then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), whenDefinedTimeoutMs); }),
    ]).finally(() => clearTimeout(timer));
  }

  /**
   * Refuses the names of web components which a module may not draw, before anything is loaded.
   * A name is refused when it is no valid name of a custom element, when it does not start with
   * the prefix of its module and a hyphen, or when it starts with the longer prefix of another
   * module of the registry: a module `taxi` may not name `taxi-ride-confirm` when there is a
   * module `taxi-ride`. The check does not look for the build id, so a name without it passes.
   *
   * @param {string} moduleId
   * @param {string} entry
   * @param {unknown[]} names
   */
  async function checkElementNames(moduleId, entry, names) {
    await registry.load();
    const prefix = elementPrefix(moduleId);
    const otherPrefixes = registry.list()
      .filter(({ id }) => id !== moduleId)
      .map(({ id }) => ({ id, prefix: elementPrefix(id) }))
      .filter((other) => other.prefix.length > prefix.length);
    for (const name of names) {
      let problem;
      if (!isValidElementName(name)) {
        problem = 'is no valid name of a custom element';
      } else if (!name.startsWith(`${prefix}-`)) {
        problem = `does not start with the prefix ${prefix} of the module and a hyphen`;
      } else {
        const other = otherPrefixes.find((candidate) => name.startsWith(`${candidate.prefix}-`));
        if (other) problem = `starts with the prefix ${other.prefix} of the module ${other.id}`;
      }
      if (problem) {
        const message = `The module ${moduleId} names the web component ${typeof name === 'string' ? name : String(name)}, which ${problem}. Every web component of the module ${moduleId} has to start with "${prefix}-", so the host loads nothing for it. Build the names with createElementNames of the module kit.`;
        logger?.error?.(message);
        throw new BcHostError({ step: 'load', moduleId, entry, element: typeof name === 'string' ? name : undefined, code: WRONG_ELEMENT_NAME, message });
      }
    }
  }

  /**
   * Step two: load the visual entry and wait for every web component it should define. First it
   * checks the names, see `checkElementNames`, and throws a `BcHostError` with the code
   * `WRONG_ELEMENT_NAME` for a name the module may not draw. When the build the host has now
   * defined all of them already, it does nothing: no import(), no waiting.
   * When an earlier build of the module defined one of them, the new visual entry could not define
   * it again, so the host loads nothing and throws a `BcHostError` with the code `ALREADY_DEFINED`.
   *
   * @param {string} moduleId
   * @param {string} entry
   * @param {string[]} names
   */
  async function load(moduleId, entry, names) {
    await checkElementNames(moduleId, entry, names);
    let read;
    try {
      read = await readManifestOf(moduleId);
    } catch (cause) {
      throw new BcHostError({ step: 'load', moduleId, entry, message: `The visual entry ${entry} of the module ${moduleId} failed to load`, cause });
    }
    const state = stateOf(moduleId);
    if (read) {
      const thisBuild = `${moduleId}\n${read.build}`;
      const definedByThisBuild = (name) => customElements.get(name) !== undefined && definedBy.get(name) === thisBuild;
      if (names.every(definedByThisBuild)) return;
      const definedEarlier = names.find((name) => !definedByThisBuild(name) && customElements.get(name) !== undefined
        && (definedBy.has(name) || state.earlierBuilds.size > 0));
      if (definedEarlier) {
        const message = `The module ${moduleId} was updated, but its new build names the web component ${definedEarlier}, which an earlier build defined in this page already. Reload the page to show the new build.`;
        logger?.error?.(message);
        throw new BcHostError({ step: 'load', moduleId, entry, element: definedEarlier, code: ALREADY_DEFINED, message });
      }
    }
    let exports;
    try {
      exports = await loadEntry(moduleId, entry);
    } catch (cause) {
      throw new BcHostError({ step: 'load', moduleId, entry, message: `The visual entry ${entry} of the module ${moduleId} failed to load`, cause });
    }
    if (exports === undefined) {
      throw new BcHostError({ step: 'load', moduleId, entry, message: `The module ${moduleId} does not name the visual entry ${entry} in its manifest` });
    }
    for (const name of names) {
      if (!(await whenDefined(name))) {
        const message = `The visual entry ${entry} of the module ${moduleId} did not define the web component ${name} within ${whenDefinedTimeoutMs} ms`;
        logger?.error?.(message);
        throw new BcHostError({ step: 'load', moduleId, entry, element: name, message });
      }
      if (read && !definedBy.has(name)) definedBy.set(name, `${moduleId}\n${read.build}`);
    }
  }

  /**
   * Picks the web components to show from what a data entry offers. The areas this host knows
   * come first; the areas it does not know are ignored. When none of its areas is offered, or
   * it has no areas, it shows the web component of `all`.
   *
   * @param {string | Record<string, string>} element
   * @returns {Record<string, string>} area -> web component; empty when nothing fits
   */
  function pickAreas(element) {
    const offered = typeof element === 'string' ? { [AREA_ALL]: element } : (element ?? {});
    const known = pageAreas.filter((area) => area !== AREA_ALL && typeof offered[area] === 'string');
    if (known.length > 0) return Object.fromEntries(known.map((area) => [area, offered[area]]));
    return typeof offered[AREA_ALL] === 'string' ? { [AREA_ALL]: offered[AREA_ALL] } : {};
  }

  let nextSubscriptionId = 0;

  /**
   * Step three: draw web components into a container and run the cockpit's side of the event
   * protocol for them. Run `load` before. Which areas are drawn follows `pickAreas`.
   *
   * @param {{ moduleId: string, entry: string, element: string | Record<string, string>, container: Element, properties?: Record<string, unknown> }} part
   */
  function draw({ moduleId, entry, element, container, properties = {} }) {
    const areas = pickAreas(element);
    /** @type {Map<string, HTMLElement>} */
    const elements = new Map();
    /** @type {Map<string, string>} area -> subscription id */
    const subscriptions = new Map();
    /** @type {Map<string, Array<{ from: string, message: unknown }>>} messages kept until their area subscribes */
    const waiting = new Map();
    /** @type {Array<() => void>} */
    const cleanups = [];

    const deliver = (area, from, message) => {
      const subscriptionId = subscriptions.get(area);
      if (subscriptionId === undefined) {
        if (!waiting.has(area)) waiting.set(area, []);
        waiting.get(area).push({ from, message });
        return;
      }
      elements.get(area)?.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: { subscriptionId, from, message } }));
    };

    const pageActions = {
      [ACTIONS.PAGE_SEND_TO]: ({ target, message }, { area }) => {
        if (!elements.has(target)) throw Object.assign(new Error(`This page has no area ${target}`), { code: ERROR_CODES.NO_TARGET });
        deliver(target, area, structuredClone(message));
      },
      [ACTIONS.PAGE_SUBSCRIBE]: (_args, { area }) => {
        nextSubscriptionId += 1;
        const subscriptionId = `subscription-${nextSubscriptionId}`;
        subscriptions.set(area, subscriptionId);
        // The kept messages follow the answer, so the part knows its subscription id by then.
        setTimeout(() => {
          for (const { from, message } of waiting.get(area)?.splice(0) ?? []) deliver(area, from, message);
        });
        return { subscriptionId };
      },
      [ACTIONS.PAGE_UNSUBSCRIBE]: ({ subscriptionId }, { area }) => {
        if (subscriptions.get(area) === subscriptionId) subscriptions.delete(area);
      },
    };

    for (const [area, name] of Object.entries(areas)) {
      let created;
      try {
        created = document.createElement(name);
        Object.assign(created, properties, { area });
      } catch (cause) {
        throw new BcHostError({ step: 'draw', moduleId, entry, element: name, message: `Creating the web component ${name} of the module ${moduleId} failed`, cause });
      }
      const onRequest = (event) => answer(created, event.detail, { moduleId, area, page: pageActions });
      created.addEventListener(REQUEST_EVENT, onRequest);
      cleanups.push(() => created.removeEventListener(REQUEST_EVENT, onRequest));
      elements.set(area, created);
    }
    for (const [area, created] of elements) {
      const slot = container.querySelector(`[data-bc-area="${area}"]`) ?? container;
      slot.append(created);
      if (!created.shadowRoot) {
        logger?.warn?.(`The web component ${created.localName} of the module ${moduleId} has no open shadow root`);
      }
    }
    return {
      elements,
      update(changed) {
        for (const created of elements.values()) Object.assign(created, changed);
      },
      remove() {
        for (const cleanup of cleanups.splice(0)) cleanup();
        subscriptions.clear();
        waiting.clear();
        for (const created of elements.values()) created.remove();
      },
    };
  }

  /** @type {Map<HTMLElement, (result: unknown) => void>} open dialogs: element -> resolve */
  const dialogs = new Map();

  const cockpitActions = {
    [ACTIONS.COCKPIT_OPEN_DIALOG]: async ({ element: name, entry, data }, { moduleId }) => {
      await load(moduleId, entry, [name]);
      const layer = document.createElement('dialog');
      layer.setAttribute('data-bc-dialog', name);
      (dialogContainer ?? document.body).append(layer);
      const part = draw({ moduleId, entry, element: name, container: layer, properties: { ...options.properties, workflowModule: registry.get(moduleId), data } });
      layer.showModal?.();
      const [created] = part.elements.values();
      return new Promise((resolve) => {
        dialogs.set(created, (result) => {
          dialogs.delete(created);
          resolve(result);
          // The answer to closeDialog goes out first. Removed before it, the web component would
          // see its request fail with DISCONNECTED.
          setTimeout(() => {
            part.remove();
            layer.remove();
          });
        });
      });
    },
    [ACTIONS.COCKPIT_CLOSE_DIALOG]: ({ result }, { element }) => {
      const close = dialogs.get(element);
      if (!close) throw Object.assign(new Error('This element is not shown in a dialog'), { code: ERROR_CODES.FAILED });
      close(result);
    },
  };

  /**
   * Answers one request exactly once, on the element it came from.
   */
  async function answer(element, detail, { moduleId, area, page }) {
    if (!detail || typeof detail.requestId !== 'string') return;
    const { requestId, action, args = {} } = detail;
    const respond = (body) => element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId, ...body } }));
    const handler = page[action] ?? cockpitActions[action] ?? actions[action];
    if (!handler) {
      respond({ ok: false, error: { code: ERROR_CODES.UNKNOWN_ACTION, message: `This host does not know the action ${action}` } });
      return;
    }
    try {
      const result = await handler(args, { moduleId, area, element });
      respond({ ok: true, result });
    } catch (error) {
      const code = error?.code && Object.values(ERROR_CODES).includes(error.code) ? error.code : ERROR_CODES.FAILED;
      respond({ ok: false, error: { code, status: error?.status, message: error?.message } });
    }
  }

  /**
   * Ask, load and draw for the page of a user task or a case, in one call.
   *
   * @param {{ moduleId: string, entry: string, data: unknown, property: 'userTask' | 'workflow', container: Element, properties?: Record<string, unknown> }} request
   */
  async function showPage({ moduleId, entry, data, property, container, properties = {} }) {
    const parts = await ask(moduleId, entry, [data]);
    if (!parts) return undefined;
    const names = Object.values(pickAreas(parts.element));
    if (names.length === 0) {
      const known = pageAreas.length > 0 ? `the areas ${pageAreas.join(', ')} or ${AREA_ALL}` : `the area ${AREA_ALL}`;
      logger?.warn?.(`The module ${moduleId} offers no web component for ${known} in its entry ${entry}, so this host shows nothing`);
      return undefined;
    }
    await load(moduleId, parts.entry, names);
    return draw({ moduleId, entry: parts.entry, element: parts.element, container, properties: { ...options.properties, ...properties, [property]: data } });
  }

  return {
    registry,
    readManifest: (moduleId) => readManifestOf(moduleId).then((read) => read?.manifest),
    loadEntry,
    areas: Object.freeze([...pageAreas]),
    entries: Object.freeze(Object.keys(knownEntries)),
    pickAreas,
    ask,
    load,
    draw,
    showUserTask: (moduleId, userTask, container, properties) =>
      showPage({ moduleId, entry: USER_TASK_FORM, data: userTask, property: 'userTask', container, properties }),
    showWorkflow: (moduleId, workflow, container, properties) =>
      showPage({ moduleId, entry: WORKFLOW_PAGE, data: workflow, property: 'workflow', container, properties }),
  };
}
