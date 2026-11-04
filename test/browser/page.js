// The script of the test page. It puts a host into the page and hands the test what it needs.

import { BcRefusedError, createModuleHost } from '@vanillabp/bc-module-host';

const calls = [];
const notifications = [];
const errors = [];
const whenDefined = new URLSearchParams(location.search).get('whenDefined');

const host = createModuleHost({
  modules: [
    { id: 'react-module', uri: '/wm/react-module' },
    { id: 'vue-module', uri: '/wm/vue-module' },
    { id: 'slow-module', uri: '/wm/slow-module' },
  ],
  whenDefinedTimeoutMs: whenDefined ? Number(whenDefined) : undefined,
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
