// The script of the test page. It puts a host into the page and hands the test what it needs.

import { BcRefusedError, createModuleHost } from '@vanillabp/bc-module-host';

const calls = [];
const notifications = [];
const errors = [];
const query = new URLSearchParams(location.search);
const whenDefined = query.get('whenDefined');

const host = createModuleHost({
  modules: [
    { id: 'react-module', uri: '/wm/react-module' },
    { id: 'vue-module', uri: '/wm/vue-module' },
    { id: 'slow-module', uri: '/wm/slow-module' },
  ],
  whenDefinedTimeoutMs: whenDefined ? Number(whenDefined) : undefined,
  // ?areas=body,actions gives the host areas; without it, it is a host with the minimum only.
  areas: query.get('areas')?.split(',').filter(Boolean),
  // ?header gives the host the entry Header.
  entries: query.has('header') ? { Header: 'header' } : undefined,
  properties: { language: 'en', currentUser: { id: 'anna' } },
  actions: {
    'userTask.claim': (args, { moduleId, area }) => { calls.push({ action: 'userTask.claim', moduleId, area, ...args }); },
    'userTask.unclaim': () => { throw new BcRefusedError(409, 'somebody else has it'); },
    'cockpit.showNotification': (args, { moduleId }) => { notifications.push({ moduleId, ...args }); },
  },
  logger: { warn: (message) => errors.push(message), error: (message) => errors.push(message) },
});

window.bcTest = {
  host,
  calls,
  notifications,
  errors,
  async show(moduleId, userTask, containerId) {
    const part = await host.showUserTask(moduleId, userTask, document.getElementById(containerId));
    return part ? [...part.elements.keys()] : undefined;
  },
  /** Asks, loads and draws the entry Header of a module, the way a cockpit with a header does. */
  async showHeader(moduleId, containerId) {
    const refs = await host.ask(moduleId, 'Header', [{ id: 'anna' }]);
    if (!refs) return undefined;
    for (const { entry, element } of refs) {
      await host.load(moduleId, entry, [element]);
      host.draw({ moduleId, entry, element, container: document.getElementById(containerId), properties: { currentUser: { id: 'anna' } } });
    }
    return refs.map(({ element }) => element);
  },
  /** Sends a raw request on a drawn web component and returns the raw answer. */
  rawRequest(selector, action, args) {
    const element = document.querySelector(selector);
    return new Promise((resolve) => {
      const requestId = `raw-${Math.random()}`;
      element.addEventListener('bc-response', (event) => {
        if (event.detail.requestId === requestId) resolve(event.detail);
      });
      element.dispatchEvent(new CustomEvent('bc-request', { detail: { requestId, action, args } }));
    });
  },
};
