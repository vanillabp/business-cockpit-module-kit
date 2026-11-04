/**
 * A minimal host for the parts of workflow modules. It does what a cockpit does to load them:
 * a registry of modules, one loader that reads the manifests and calls import(), the three steps
 * ask, load and draw, and the cockpit's side of the event protocol. It is a reference for tests,
 * not a cockpit: it has no lists, no routing and no login.
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
  entryUrl,
  readManifest,
} from '@vanillabp/bc-module-kit';

/** How long the host waits for a web component to be defined, in milliseconds. */
export const DEFAULT_WHEN_DEFINED_TIMEOUT_MS = 10_000;

/** A step of ask, load and draw that failed. */
export class BcHostError extends Error {
  /**
   * @param {{ step: 'ask' | 'load' | 'draw', moduleId: string, entry?: string, element?: string, message: string, cause?: unknown }} details
   */
  constructor({ step, moduleId, entry, element, message, cause }) {
    super(message, { cause });
    this.name = 'BcHostError';
    this.step = step;
    this.moduleId = moduleId;
    this.entry = entry;
    this.element = element;
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
    actions = {},
    logger = globalThis.console,
    dialogContainer,
  } = options;

  /** @type {Map<string, { id: string, uri?: string, version?: string }>} */
  const modules = new Map((options.modules ?? []).map((module) => [module.id, module]));
  /** @type {Map<string, Promise<{ manifest: any, url: string } | undefined>>} */
  const manifests = new Map();
  /** @type {Map<string, Promise<any>>} */
  const entries = new Map();
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
   * Reads the manifest of a module once. A module without a manifest (404) has no parts, and the
   * host does not ask again. Any other failure is forgotten, so the next call asks again.
   */
  function readManifestOf(moduleId) {
    let promise = manifests.get(moduleId);
    if (!promise) {
      const url = manifestUrlOf(moduleId);
      promise = (async () => {
        const module = await registry.ensure(moduleId);
        if (module && module.uri === '') return undefined;
        const response = await fetchFn(url, { cache: 'no-cache' });
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`${url} answered with HTTP status ${response.status}`);
        return { manifest: readManifest(await response.text()), url };
      })();
      manifests.set(moduleId, promise);
      promise.catch(() => manifests.delete(moduleId));
    }
    return promise;
  }

  /**
   * Loads an entry of a module once and returns its exports, or `undefined` when the module's
   * manifest does not name it. A failed load is forgotten, so a retry reads the manifest again
   * and calls import() again.
   *
   * @param {string} moduleId
   * @param {string} entry
   */
  function loadEntry(moduleId, entry) {
    const key = `${moduleId}\n${entry}`;
    let promise = entries.get(key);
    if (!promise) {
      promise = (async () => {
        const read = await readManifestOf(moduleId);
        if (!read) return undefined;
        const url = entryUrl(read.manifest, entry, read.url);
        if (!url) return undefined;
        return importModule(url);
      })();
      entries.set(key, promise);
      promise.catch(() => {
        entries.delete(key);
        manifests.delete(moduleId);
      });
    }
    return promise;
  }

  /**
   * Step one: ask a data entry. Calls its function with the arguments and returns the answer, or
   * `undefined` when the module does not name the entry or does not export the function.
   *
   * @param {string} moduleId
   * @param {string} entry a data entry, for example `UserTaskForm`
   * @param {unknown[]} args
   * @param {string} [exportName] the function's name; by default the one the kit knows for the entry
   */
  async function ask(moduleId, entry, args = [], exportName = EXPORT_NAMES[entry]) {
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
   * Step two: load the visual entry and wait for every web component it should define.
   *
   * @param {string} moduleId
   * @param {string} entry
   * @param {string[]} names
   */
  async function load(moduleId, entry, names) {
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
    }
  }

  let nextSubscriptionId = 0;

  /**
   * Step three: draw web components into a container and run the cockpit's side of the event
   * protocol for them. Run `load` before.
   *
   * @param {{ moduleId: string, entry: string, element: string | Record<string, string>, container: Element, properties?: Record<string, unknown> }} part
   */
  function draw({ moduleId, entry, element, container, properties = {} }) {
    const areas = typeof element === 'string' ? { [AREA_ALL]: element } : element;
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
          part.remove();
          layer.remove();
          resolve(result);
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
    const names = typeof parts.element === 'string' ? [parts.element] : Object.values(parts.element);
    await load(moduleId, parts.entry, names);
    return draw({ moduleId, entry: parts.entry, element: parts.element, container, properties: { ...options.properties, ...properties, [property]: data } });
  }

  return {
    registry,
    readManifest: (moduleId) => readManifestOf(moduleId).then((read) => read?.manifest),
    loadEntry,
    ask,
    load,
    draw,
    showUserTask: (moduleId, userTask, container, properties) =>
      showPage({ moduleId, entry: USER_TASK_FORM, data: userTask, property: 'userTask', container, properties }),
    showWorkflow: (moduleId, workflow, container, properties) =>
      showPage({ moduleId, entry: WORKFLOW_PAGE, data: workflow, property: 'workflow', container, properties }),
  };
}
