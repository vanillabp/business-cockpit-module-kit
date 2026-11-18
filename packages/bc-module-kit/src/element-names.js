/**
 * The names of a module's web components. All modules define their web components in the one
 * `customElements` registry of the page, so every name has three parts:
 *
 *     taxi-ride-mvaro4w0-taxi-ride--assess-risk--form
 *     prefix    build    short name
 *
 * The prefix comes from the module id and keeps the modules apart. The build id is new for every
 * build and keeps the builds of one module apart: the browser can define a name only once per
 * page, so a new build needs new names to load without a reload of the page. The short name holds
 * the BPMN ids of the workflow or the user task, so it is unique within the module.
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

/** One id or part in a short name: words of lower case letters and digits, one hyphen between two words. */
const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Turns a BPMN id, like the id of a process or the task definition of a user task, into one
 * segment of a short name. The rules are those of {@link elementPrefix}, with two differences:
 * a run of hyphens becomes one hyphen as well, and there is no `wm-` in front, because the segment
 * never starts the name. So the segment never has `--` and never starts or ends with a hyphen.
 *
 * `TaxiRide` gives `taxi-ride`, `assessRisk` and `assess_risk` give `assess-risk`.
 *
 * @param {unknown} bpmnId
 * @param {string} what what the id is, for the message of the error
 * @returns {string}
 */
function bpmnSegment(bpmnId, what) {
  if (typeof bpmnId !== 'string') {
    throw new TypeError(`The ${what} must be a string, but it is ${describe(bpmnId)}`);
  }
  const segment = bpmnId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (segment === '') {
    throw new TypeError(
      `The ${what} ${describe(bpmnId)} has no letter and no digit, so it cannot be part of the name of a web component`,
    );
  }
  return segment;
}

/**
 * @param {unknown} value
 * @param {string} what what the value is, for the message of the error
 * @returns {string}
 */
function checkedSegment(value, what) {
  if (typeof value !== 'string' || !SEGMENT.test(value)) {
    throw new TypeError(
      `The ${what} must be lower case letters and digits, with one hyphen between two words and no hyphen at the start or the end, but it is ${describe(value)}`,
    );
  }
  return value;
}

/**
 * @typedef {object} ElementNames
 * @property {(bpmnProcessId: string, part: string) => string} workflow
 *   the name of a part which shows a workflow: `<prefix>-<build id>-<process>--<part>`
 * @property {(bpmnProcessId: string, taskDefinition: string, part: string) => string} userTask
 *   the name of a part which shows a user task: `<prefix>-<build id>-<process>--<task>--<part>`
 * @property {(shortName: string) => string} custom
 *   the name of anything else: `<prefix>-<build id>-<short name>`
 */

/**
 * Returns the functions which build the names of a module's web components. Every name starts
 * with `<prefix>-<build id>-`. The prefix comes from {@link elementPrefix}. The short name after it
 * is made of segments, and `--` goes between two segments:
 *
 * - `workflow(bpmnProcessId, part)` gives `<process>--<part>`,
 * - `userTask(bpmnProcessId, taskDefinition, part)` gives `<process>--<task>--<part>`,
 * - `custom(shortName)` gives the short name as it is, for anything else.
 *
 * A segment is lower case letters and digits, with one hyphen between two words. It never has `--`
 * and never starts or ends with a hyphen. The BPMN ids become segments by the rules of
 * `elementPrefix`, see above. A part and a custom short name must be a segment already. So a name
 * of a workflow has one `--` in its short name, a name of a user task two and a custom name none,
 * and splitting the short name at `--` gives back the segments. That is why two different
 * workflows, user tasks or parts never get the same name.
 *
 * Two BPMN ids which differ only in case or in the characters which become a hyphen, like
 * `assess_risk` and `assessRisk`, give the same segment and so the same name. `defineBcElement`
 * then says that the name is defined already.
 *
 * A module calls it once, in a small file of its own which its data entries and its visual entries
 * import. The build script writes the module id and the build id before it starts the bundler:
 *
 *     import { createElementNames } from "@vanillabp/bc-module-kit";
 *     import { WORKFLOW_MODULE_ID, BUILD_ID } from "./bc-build.js";
 *
 *     export const names = createElementNames(WORKFLOW_MODULE_ID, BUILD_ID);
 *     // names.userTask('TaxiRide', 'assessRisk', 'form') === 'taxi-ride-mvaro4w0-taxi-ride--assess-risk--form'
 *     // names.workflow('TaxiRide', 'page') === 'taxi-ride-mvaro4w0-taxi-ride--page'
 *     // names.custom('price-chart') === 'taxi-ride-mvaro4w0-price-chart'
 *
 * @param {string} workflowModuleId the id the module registers with at the cockpit
 * @param {string} buildId new for every build, only lower case letters and digits, for example
 *   `Date.now().toString(36)`
 * @returns {Readonly<ElementNames>}
 */
export function createElementNames(workflowModuleId, buildId) {
  const prefix = elementPrefix(workflowModuleId);
  if (typeof buildId !== 'string' || !/^[a-z0-9]+$/.test(buildId)) {
    throw new TypeError(
      `The build id must be a string of lower case letters and digits, for example Date.now().toString(36), but it is ${describe(buildId)}`,
    );
  }
  /** @param {string[]} segments */
  const name = (...segments) => {
    const whole = `${prefix}-${buildId}-${segments.join('--')}`;
    if (RESERVED_NAMES.includes(whole)) {
      throw new TypeError(`"${whole}" is a reserved name in HTML and cannot be the name of a web component`);
    }
    return whole;
  };
  return Object.freeze({
    workflow: (bpmnProcessId, part) =>
      name(bpmnSegment(bpmnProcessId, 'BPMN process id'), checkedSegment(part, 'part')),
    userTask: (bpmnProcessId, taskDefinition, part) =>
      name(
        bpmnSegment(bpmnProcessId, 'BPMN process id'),
        bpmnSegment(taskDefinition, 'task definition'),
        checkedSegment(part, 'part'),
      ),
    custom: (shortName) => name(checkedSegment(shortName, 'short name of a web component')),
  });
}

/** @param {unknown} value */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
