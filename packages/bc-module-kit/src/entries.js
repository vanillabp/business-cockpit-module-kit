/**
 * The names of the entries every cockpit knows, and the names of the functions those entries
 * export. This is the minimum. A cockpit may know more entries and more areas of a page, for
 * example a Header entry or the areas body, information and actions. Those differ from one
 * organisation to the next, so they belong to the types library of that cockpit, not here.
 *
 * @module @vanillabp/bc-module-kit/entries
 */

/** The columns of the task lists. The entry exports `userTaskListColumns`. */
export const USER_TASK_LIST = 'UserTaskList';

/** The columns of the case list. The entry exports `workflowListColumns`. */
export const WORKFLOW_LIST = 'WorkflowList';

/** The page of a user task. The entry exports `userTaskForm`. */
export const USER_TASK_FORM = 'UserTaskForm';

/** The page of a case. The entry exports `workflowPage`. */
export const WORKFLOW_PAGE = 'WorkflowPage';

/**
 * For each data entry, the name of the function it exports. This map is the one source of the
 * data entries: an entry which exports a function is a data entry, and a visual entry exports no
 * function. A cockpit with entries of its own, for example `Header`, extends this map in its
 * types library: `{ ...EXPORT_NAMES, Header: 'header' }`.
 */
export const EXPORT_NAMES = Object.freeze({
  [USER_TASK_LIST]: 'userTaskListColumns',
  [WORKFLOW_LIST]: 'workflowListColumns',
  [USER_TASK_FORM]: 'userTaskForm',
  [WORKFLOW_PAGE]: 'workflowPage',
});

/**
 * The entries which carry no framework: the keys of `EXPORT_NAMES`, in the same order. It is
 * derived from that map, so never list a data entry here. `bc-check-entries` checks their size
 * and their content. A module with entries of its own, for example `Header`, names them with
 * the option `--data-entry` of `bc-check-entries`.
 */
export const DATA_ENTRIES = Object.freeze(Object.keys(EXPORT_NAMES));

/**
 * The area of the one web component which shows the whole page. Every cockpit knows it. A
 * cockpit without areas of its own shows this web component.
 */
export const AREA_ALL = 'all';
