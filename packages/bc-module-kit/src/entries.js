/**
 * The names of the entries a workflow module offers in its bc-manifest.json, and the names of
 * the functions those entries export.
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

/** Buttons in the header. The entry exports `header`. Only cockpits which have this extension point ask it. */
export const HEADER = 'Header';

/** Pages of a module and their menu entries. The entry exports `pages`. Only cockpits which have this extension point ask it. */
export const PAGES = 'Pages';

/**
 * The entries which carry no framework. `bc-check-entries` checks their size and their content.
 * A cockpit with extension points of its own adds their names, for example with the option
 * `--data-entry` of `bc-check-entries`.
 */
export const DATA_ENTRIES = Object.freeze([
  USER_TASK_LIST,
  WORKFLOW_LIST,
  USER_TASK_FORM,
  WORKFLOW_PAGE,
  HEADER,
  PAGES,
]);

/** For each data entry, the name of the function it exports. */
export const EXPORT_NAMES = Object.freeze({
  [USER_TASK_LIST]: 'userTaskListColumns',
  [WORKFLOW_LIST]: 'workflowListColumns',
  [USER_TASK_FORM]: 'userTaskForm',
  [WORKFLOW_PAGE]: 'workflowPage',
  [HEADER]: 'header',
  [PAGES]: 'pages',
});

/** The main area of a page. A long form scrolls in it. */
export const AREA_BODY = 'body';

/** The top of the column on the right of a page. */
export const AREA_INFORMATION = 'information';

/** The bottom of the column on the right of a page. It never scrolls away. */
export const AREA_ACTIONS = 'actions';

/** The area of the one web component of an all-in-one page. */
export const AREA_ALL = 'all';
