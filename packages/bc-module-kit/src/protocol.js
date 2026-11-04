/**
 * The module's side of the event protocol between a part of a workflow module and the cockpit.
 * A part calls a function, the helper dispatches a `bc-request` on the part's web component, and
 * the cockpit answers with a `bc-response` on the same element.
 *
 * @module @vanillabp/bc-module-kit/protocol
 */

/** The event a part dispatches on its own web component to ask the cockpit for something. */
export const REQUEST_EVENT = 'bc-request';

/** The event the cockpit dispatches on the same web component to answer a request. */
export const RESPONSE_EVENT = 'bc-response';

/** The event the cockpit dispatches on the web component of an area to deliver a message. */
export const MESSAGE_EVENT = 'bc-message';

/** The actions every cockpit knows. */
export const ACTIONS = Object.freeze({
  USER_TASK_OPEN: 'userTask.open',
  USER_TASK_NAVIGATE_TO_WORKFLOW: 'userTask.navigateToWorkflow',
  USER_TASK_CLAIM: 'userTask.claim',
  USER_TASK_UNCLAIM: 'userTask.unclaim',
  USER_TASK_ASSIGN: 'userTask.assign',
  USER_TASK_UNASSIGN: 'userTask.unassign',
  WORKFLOW_NAVIGATE_TO_WORKFLOW: 'workflow.navigateToWorkflow',
  WORKFLOW_GET_USER_TASKS: 'workflow.getUserTasks',
  PAGE_SEND_TO: 'page.sendTo',
  PAGE_SUBSCRIBE: 'page.subscribe',
  PAGE_UNSUBSCRIBE: 'page.unsubscribe',
  COCKPIT_SHOW_NOTIFICATION: 'cockpit.showNotification',
  COCKPIT_OPEN_DIALOG: 'cockpit.openDialog',
  COCKPIT_CLOSE_DIALOG: 'cockpit.closeDialog',
});

/** The codes of a failed request. The cockpit sets the first four, the helper sets the last two. */
export const ERROR_CODES = Object.freeze({
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  REFUSED: 'REFUSED',
  FAILED: 'FAILED',
  NO_TARGET: 'NO_TARGET',
  TIMEOUT: 'TIMEOUT',
  DISCONNECTED: 'DISCONNECTED',
});

/** How long the helper waits for an answer, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Actions which wait for the user and so have no timeout. */
export const ACTIONS_WITHOUT_TIMEOUT = Object.freeze([ACTIONS.COCKPIT_OPEN_DIALOG]);

/** A request the cockpit did not carry out, or one which got no answer. */
export class BcRequestError extends Error {
  /**
   * @param {{ code: string, message?: string, status?: number, action: string }} details
   */
  constructor({ code, message, status, action }) {
    super(message || `The cockpit answered "${action}" with ${code}`);
    this.name = 'BcRequestError';
    this.code = code;
    this.status = status;
    this.action = action;
  }
}

/** @type {WeakMap<EventTarget, Map<string, (error: BcRequestError) => void>>} */
const openRequests = new WeakMap();

let counter = 0;

/**
 * A correlation id. `crypto.randomUUID()` exists only in a secure context, so a page served over
 * plain http on another host than localhost gets a counter with a random part instead.
 */
function newRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Asks the cockpit to run an action and waits for its answer.
 *
 * @param {EventTarget} element the web component of the part
 * @param {string} action for example `userTask.claim`
 * @param {Record<string, unknown>} [args]
 * @param {number} [timeoutMs] 0 waits for ever; by default 30 seconds, and no limit for `cockpit.openDialog`
 * @returns {Promise<unknown>} the `result` of the answer
 */
export function requestFromCockpit(element, action, args = {}, timeoutMs) {
  const limit = timeoutMs ?? (ACTIONS_WITHOUT_TIMEOUT.includes(action) ? 0 : DEFAULT_TIMEOUT_MS);
  const requestId = newRequestId();
  return new Promise((resolve, reject) => {
    let timer;
    let pending = openRequests.get(element);
    if (!pending) {
      pending = new Map();
      openRequests.set(element, pending);
    }
    const finish = () => {
      clearTimeout(timer);
      element.removeEventListener(RESPONSE_EVENT, onResponse);
      pending.delete(requestId);
    };
    const onResponse = (/** @type {CustomEvent} */ event) => {
      const detail = event.detail;
      if (!detail || detail.requestId !== requestId) return;
      finish();
      if (detail.ok) {
        resolve(detail.result);
      } else {
        const error = detail.error ?? {};
        reject(new BcRequestError({ code: error.code ?? ERROR_CODES.FAILED, message: error.message, status: error.status, action }));
      }
    };
    pending.set(requestId, (error) => {
      finish();
      reject(error);
    });
    element.addEventListener(RESPONSE_EVENT, onResponse);
    if (limit > 0) {
      timer = setTimeout(() => {
        finish();
        reject(new BcRequestError({ code: ERROR_CODES.TIMEOUT, message: `No answer to "${action}" within ${limit} ms`, action }));
      }, limit);
    }
    element.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
      bubbles: false,
      composed: false,
      detail: { requestId, action, args },
    }));
  });
}

/**
 * Rejects every open request of an element with `DISCONNECTED`. A web component calls it when it
 * leaves the page, in `disconnectedCallback`. `defineBcElement` does that by itself.
 *
 * @param {EventTarget} element
 */
export function rejectOpenRequests(element) {
  const pending = openRequests.get(element);
  if (!pending) return;
  for (const reject of [...pending.values()]) {
    reject(new BcRequestError({ code: ERROR_CODES.DISCONNECTED, message: 'The element left the page before the answer came', action: '' }));
  }
}

/**
 * Sends a message to the web component of another area of the same page.
 *
 * @param {EventTarget} element
 * @param {string} target the area, for example `actions`
 * @param {unknown} message any value that survives `structuredClone`
 * @returns {Promise<void>}
 */
export function sendTo(element, target, message) {
  return /** @type {Promise<void>} */ (requestFromCockpit(element, ACTIONS.PAGE_SEND_TO, { target, message }));
}

/**
 * Asks the cockpit to deliver the messages for this element's area to `handler`.
 * Messages which arrive before the cockpit has answered are kept and handed over once the
 * subscription id is known, so none gets lost.
 *
 * @param {EventTarget} element
 * @param {(message: unknown, from: string) => void} handler
 * @returns {import('./index.js').BcSubscription}
 */
export function receiveMessage(element, handler) {
  /** @type {string | undefined} */
  let subscriptionId;
  let stopped = false;
  /** @type {Array<{ subscriptionId: string, from: string, message: unknown }>} */
  const early = [];
  const onMessage = (/** @type {CustomEvent} */ event) => {
    const detail = event.detail;
    if (!detail || stopped) return;
    if (subscriptionId === undefined) {
      early.push(detail);
    } else if (detail.subscriptionId === subscriptionId) {
      handler(detail.message, detail.from);
    }
  };
  element.addEventListener(MESSAGE_EVENT, onMessage);
  const ready = requestFromCockpit(element, ACTIONS.PAGE_SUBSCRIBE, {}).then((result) => {
    subscriptionId = /** @type {any} */ (result)?.subscriptionId;
    for (const detail of early.splice(0)) {
      if (!stopped && detail.subscriptionId === subscriptionId) handler(detail.message, detail.from);
    }
  });
  ready.catch(() => element.removeEventListener(MESSAGE_EVENT, onMessage));
  return {
    ready,
    unsubscribe: async () => {
      if (stopped) return;
      stopped = true;
      element.removeEventListener(MESSAGE_EVENT, onMessage);
      await ready.catch(() => undefined);
      if (subscriptionId !== undefined) {
        await requestFromCockpit(element, ACTIONS.PAGE_UNSUBSCRIBE, { subscriptionId });
      }
    },
  };
}

/**
 * Shows a toast in the cockpit.
 *
 * @param {EventTarget} element
 * @param {import('./index.js').BcNotification} notification
 * @returns {Promise<void>}
 */
export function showNotification(element, { level, text, sticky = false }) {
  return /** @type {Promise<void>} */ (requestFromCockpit(element, ACTIONS.COCKPIT_SHOW_NOTIFICATION, { level, text, sticky }));
}

/**
 * Asks the cockpit to show a web component in a modal dialog. Resolves with what the dialog
 * closed with. It has no timeout, because it waits for the user.
 *
 * @param {EventTarget} element
 * @param {import('./index.js').BcElementRef} dialog
 * @param {unknown} [data] handed to the dialog's web component as the property `data`
 * @returns {Promise<unknown>}
 */
export function openDialog(element, { element: name, entry }, data) {
  return requestFromCockpit(element, ACTIONS.COCKPIT_OPEN_DIALOG, { element: name, entry, data });
}

/**
 * Closes the dialog this element is shown in.
 *
 * @param {EventTarget} element the web component of the dialog
 * @param {unknown} [result] what `openDialog` resolves with
 * @returns {Promise<void>}
 */
export function closeDialog(element, result) {
  return /** @type {Promise<void>} */ (requestFromCockpit(element, ACTIONS.COCKPIT_CLOSE_DIALOG, { result }));
}

/**
 * Adds the functions of a user task to its plain data from the GUI API.
 *
 * @param {EventTarget} element
 * @param {Record<string, any>} data
 * @returns {import('./index.js').BcUserTask}
 */
export function toBcUserTask(element, data) {
  const userTaskId = data.id;
  const request = (action, args = {}) => requestFromCockpit(element, action, { userTaskId, ...args });
  return {
    ...data,
    open: () => request(ACTIONS.USER_TASK_OPEN),
    navigateToWorkflow: () => request(ACTIONS.USER_TASK_NAVIGATE_TO_WORKFLOW),
    claim: () => request(ACTIONS.USER_TASK_CLAIM),
    unclaim: () => request(ACTIONS.USER_TASK_UNCLAIM),
    assign: (userId) => request(ACTIONS.USER_TASK_ASSIGN, { userId }),
    unassign: (userId) => request(ACTIONS.USER_TASK_UNASSIGN, { userId }),
    sendTo: (target, message) => sendTo(element, target, message),
    receiveMessage: (handler) => receiveMessage(element, handler),
  };
}

/**
 * Adds the functions of a case to its plain data from the GUI API.
 *
 * @param {EventTarget} element
 * @param {Record<string, any>} data
 * @returns {import('./index.js').BcWorkflow}
 */
export function toBcWorkflow(element, data) {
  const workflowId = data.id;
  return {
    ...data,
    navigateToWorkflow: () => requestFromCockpit(element, ACTIONS.WORKFLOW_NAVIGATE_TO_WORKFLOW, { workflowId }),
    getUserTasks: async (activeOnly, limitListAccordingToCurrentUsersPermissions) => {
      const userTasks = await requestFromCockpit(element, ACTIONS.WORKFLOW_GET_USER_TASKS, {
        workflowId,
        activeOnly,
        limitListAccordingToCurrentUsersPermissions,
      });
      return (/** @type {any[]} */ (userTasks) ?? []).map((userTask) => toBcUserTask(element, userTask));
    },
    sendTo: (target, message) => sendTo(element, target, message),
    receiveMessage: (handler) => receiveMessage(element, handler),
  };
}
