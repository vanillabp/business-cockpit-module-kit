/**
 * The names of a module's web components. All modules define their web components in the one
 * `customElements` registry of the page, so every name has three parts:
 *
 *     taxi-ride-mvaro4w0-assess-risk-form
 *     prefix    build    short name
 *
 * The prefix comes from the module id and keeps the modules apart. The build id is new for every
 * build and keeps the builds of one module apart: the browser can define a name only once per
 * page, so a new build needs new names to load without a reload of the page. The short name is
 * the module's choice.
 *
 * @module @vanillabp/bc-module-kit/element-names
 */

/** Names the HTML standard does not allow for a custom element, although they have a hyphen. */
const RESERVED_NAMES = Object.freeze([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

/**
 * Turns a module id into the prefix of its web components. A module id can be any string, but a
 * custom element name has to start with a lower case letter and must not have upper case letters.
 * The cockpit uses the same function to check the names a module draws, so the two always agree.
 *
 * 1. A hyphen goes between a lower case letter or a digit and an upper case letter after it.
 * 2. Every letter becomes lower case.
 * 3. Each run of characters other than `a` to `z`, `0` to `9` and `-` becomes one hyphen, and
 *    hyphens at the start and at the end are removed.
 * 4. If the result is empty or does not start with a letter, `wm-` goes in front of it.
 *
 * `taxi-ride` and `TaxiRide` give `taxi-ride`, `loan_approval.2` gives `loan-approval-2` and
 * `4711` gives `wm-4711`.
 *
 * @param {string} workflowModuleId the id the module registers with at the cockpit
 * @returns {string}
 */
export function elementPrefix(workflowModuleId) {
  if (typeof workflowModuleId !== 'string') {
    throw new TypeError(`The module id must be a string, but it is ${describe(workflowModuleId)}`);
  }
  const prefix = workflowModuleId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(prefix) ? prefix : `wm-${prefix}`;
}

/**
 * Returns a function which turns a short name into the whole name of a web component:
 * `<prefix>-<build id>-<short name>`. The prefix comes from {@link elementPrefix}.
 *
 * A module calls it once, in a small file of its own which its data entries and its visual entries
 * import. The build script writes the module id and the build id before it starts the bundler:
 *
 *     import { createElementNames } from "@vanillabp/bc-module-kit";
 *     import { WORKFLOW_MODULE_ID, BUILD_ID } from "./bc-build.js";
 *
 *     export const elementName = createElementNames(WORKFLOW_MODULE_ID, BUILD_ID);
 *     // elementName('assess-risk-form') === 'taxi-ride-mvaro4w0-assess-risk-form'
 *
 * @param {string} workflowModuleId the id the module registers with at the cockpit
 * @param {string} buildId new for every build, only lower case letters and digits, for example
 *   `Date.now().toString(36)`
 * @returns {(shortName: string) => string}
 */
export function createElementNames(workflowModuleId, buildId) {
  const prefix = elementPrefix(workflowModuleId);
  if (typeof buildId !== 'string' || !/^[a-z0-9]+$/.test(buildId)) {
    throw new TypeError(
      `The build id must be a string of lower case letters and digits, for example Date.now().toString(36), but it is ${describe(buildId)}`,
    );
  }
  return (shortName) => {
    if (typeof shortName !== 'string' || !/^[a-z0-9-]+$/.test(shortName)) {
      throw new TypeError(
        `The short name of a web component must be a string of lower case letters, digits and hyphens, but it is ${describe(shortName)}`,
      );
    }
    const name = `${prefix}-${buildId}-${shortName}`;
    if (RESERVED_NAMES.includes(name)) {
      throw new TypeError(`"${name}" is a reserved name in HTML and cannot be the name of a web component`);
    }
    return name;
  };
}

/** @param {unknown} value */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
