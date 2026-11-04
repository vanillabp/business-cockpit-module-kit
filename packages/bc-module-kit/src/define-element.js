/**
 * Builds the web component of a module's part from three plain functions, so a module writes no
 * shadow root and no event protocol by hand.
 *
 * @module @vanillabp/bc-module-kit/define-element
 */

import { closeDialog, openDialog, receiveMessage, rejectOpenRequests, requestFromCockpit, sendTo, showNotification, toBcUserTask, toBcWorkflow } from './protocol.js';

/** The properties every cockpit may set on a part's web component. */
export const HOST_PROPERTIES = Object.freeze(['userTask', 'workflow', 'area', 'language', 'currentUser', 'workflowModule', 'data']);

/**
 * Defines a custom element under `name`. When the cockpit puts it into the page, it attaches an
 * open shadow root and calls `mount` with the root and the properties. When the cockpit sets a
 * property again, it calls `update` once per task. When the element leaves the page, it calls
 * `unmount`, stops every subscription the part made and rejects every open request with
 * `DISCONNECTED`.
 *
 * @param {string} name the name of the web component; by convention it starts with the module id
 * @param {import('./index.js').BcElementFunctions} functions
 * @param {{ properties?: string[] }} [options] further properties an extension point of this cockpit sets
 * @returns {CustomElementConstructor}
 */
export function defineBcElement(name, { mount, update, unmount }, options = {}) {
  if (typeof globalThis.customElements === 'undefined') {
    throw new Error('defineBcElement needs a browser: customElements does not exist here');
  }
  if (customElements.get(name)) {
    throw new Error(`The web component "${name}" is defined already. Its name must start with the module id, so it is unique.`);
  }
  const properties = [...HOST_PROPERTIES, ...(options.properties ?? [])];

  class BcElement extends HTMLElement {
    /** @type {Record<string, unknown>} */
    #values = {};
    /** @type {Array<{ unsubscribe: () => Promise<void> }>} */
    #subscriptions = [];
    #mounted = false;
    #updateQueued = false;

    constructor() {
      super();
      // A value set before the element was upgraded sits on the instance and hides the accessor.
      for (const property of properties) {
        if (Object.hasOwn(this, property)) {
          const value = this[property];
          delete this[property];
          this.#values[property] = value;
        }
      }
    }

    /** @param {string} property */
    bcGet(property) {
      return this.#values[property];
    }

    /** @param {string} property @param {unknown} value */
    bcSet(property, value) {
      this.#values[property] = value;
      this.#changed();
    }

    connectedCallback() {
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      if (this.#mounted) return;
      this.#mounted = true;
      mount(root, this.#props());
    }

    disconnectedCallback() {
      if (!this.#mounted) return;
      this.#mounted = false;
      rejectOpenRequests(this);
      for (const subscription of this.#subscriptions.splice(0)) subscription.unsubscribe().catch(() => undefined);
      unmount?.(/** @type {ShadowRoot} */ (this.shadowRoot));
    }

    /** Collects all changes of one task into one call of `update`. */
    #changed() {
      if (!this.#mounted || this.#updateQueued) return;
      this.#updateQueued = true;
      queueMicrotask(() => {
        this.#updateQueued = false;
        if (this.#mounted) update?.(/** @type {ShadowRoot} */ (this.shadowRoot), this.#props());
      });
    }

    #props() {
      const receive = (handler) => {
        const subscription = receiveMessage(this, handler);
        this.#subscriptions.push(subscription);
        return subscription;
      };
      /** @type {Record<string, any>} */
      const props = { ...this.#values };
      if (props.userTask) props.userTask = { ...toBcUserTask(this, props.userTask), receiveMessage: receive };
      if (props.workflow) props.workflow = { ...toBcWorkflow(this, props.workflow), receiveMessage: receive };
      return {
        ...props,
        element: this,
        showNotification: (notification) => showNotification(this, notification),
        openDialog: (dialog, data) => openDialog(this, dialog, data),
        closeDialog: (result) => closeDialog(this, result),
        sendTo: (target, message) => sendTo(this, target, message),
        receiveMessage: receive,
        request: (action, args, timeoutMs) => requestFromCockpit(this, action, args, timeoutMs),
      };
    }
  }

  for (const property of properties) {
    Object.defineProperty(BcElement.prototype, property, {
      configurable: true,
      enumerable: true,
      get() {
        return this.bcGet(property);
      },
      set(value) {
        this.bcSet(property, value);
      },
    });
  }

  customElements.define(name, BcElement);
  return BcElement;
}
