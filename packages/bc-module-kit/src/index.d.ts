// Types of @vanillabp/bc-module-kit. The data of the GUI API (UserTask, Workflow, CurrentUser)
// comes from the types library of a generated cockpit. The kit only knows the fields it reads,
// so it takes them as generic records.

/** Data of the GUI API: a user task, a case or the current user, as plain JSON. */
export type GuiApiData = { id?: string; [field: string]: any };

// --- entries ---------------------------------------------------------------------------------

export declare const USER_TASK_LIST: 'UserTaskList';
export declare const WORKFLOW_LIST: 'WorkflowList';
export declare const USER_TASK_FORM: 'UserTaskForm';
export declare const WORKFLOW_PAGE: 'WorkflowPage';
export declare const HEADER: 'Header';
export declare const PAGES: 'Pages';
export declare const DATA_ENTRIES: readonly ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage', 'Header', 'Pages'];
export declare const EXPORT_NAMES: Readonly<{
  UserTaskList: 'userTaskListColumns';
  WorkflowList: 'workflowListColumns';
  UserTaskForm: 'userTaskForm';
  WorkflowPage: 'workflowPage';
  Header: 'header';
  Pages: 'pages';
}>;
export declare const AREA_BODY: 'body';
export declare const AREA_INFORMATION: 'information';
export declare const AREA_ACTIONS: 'actions';
export declare const AREA_ALL: 'all';

/** A text per language. The keys are language codes like 'en' or 'de'. */
export interface Translatable {
  [languageKey: string]: string;
}

export interface Column {
  title: Translatable;
  /** Path of the value within the user task or the case. */
  path: string;
  type?: 'value' | 'i18n' | 'person' | 'date' | 'date-time' | 'time';
  priority: number;
  width: string;
  show: boolean;
  sortable: boolean;
  filterable: boolean;
  resizeable: boolean;
}

/** A web component that a data entry names, and the visual entry that defines it. */
export interface BcElementRef {
  element: string;
  entry: string;
}

/** Area -> name of a web component. By convention 'body', 'information', 'actions'. */
export type PageAreas = { [area: string]: string };

/** One web component (the all-in-one form), or one per area. */
export interface BcPageParts {
  element: string | PageAreas;
  entry: string;
}

export interface BcPage extends BcElementRef {
  id: string;
  title: Translatable;
  menu: boolean;
}

export type ColumnsOfUserTaskFunction<U = GuiApiData> = (userTask: U) => Column[] | undefined;
export type ColumnsOfWorkflowFunction<W = GuiApiData> = (workflow: W) => Column[] | undefined;
/** undefined: this user task is not the module's. */
export type UserTaskFormFunction<U = GuiApiData> = (userTask: U) => BcPageParts | undefined;
/** undefined: this case is not the module's. */
export type WorkflowPageFunction<W = GuiApiData> = (workflow: W) => BcPageParts | undefined;
export type HeaderFunction<C = GuiApiData> = (currentUser: C) => BcElementRef[] | undefined;
export type PagesFunction<C = GuiApiData> = (currentUser: C) => BcPage[] | undefined;

// --- manifest --------------------------------------------------------------------------------

export interface BcManifest {
  manifestVersion: 1;
  buildVersion?: string;
  buildTimestamp?: string;
  /** Entry name -> file, relative to the manifest. */
  entries: { readonly [entry: string]: string };
}

export declare const MANIFEST_FILE_NAME: 'bc-manifest.json';
export declare const MANIFEST_VERSION: 1;
export declare class BcManifestError extends Error {
  readonly problems: string[];
  constructor(problems: string[]);
}
export declare function checkManifest(manifest: unknown): string[];
export declare function readManifest(source: string | object): BcManifest;
export declare function createManifest(options: {
  entries: Record<string, string>;
  buildVersion?: string;
  buildTimestamp?: string | Date;
}): BcManifest;
export declare function entryUrl(manifest: BcManifest, entry: string, manifestUrl: string | URL): string | undefined;

// --- event protocol --------------------------------------------------------------------------

export declare const REQUEST_EVENT: 'bc-request';
export declare const RESPONSE_EVENT: 'bc-response';
export declare const MESSAGE_EVENT: 'bc-message';
export declare const ACTIONS: Readonly<{
  USER_TASK_OPEN: 'userTask.open';
  USER_TASK_NAVIGATE_TO_WORKFLOW: 'userTask.navigateToWorkflow';
  USER_TASK_CLAIM: 'userTask.claim';
  USER_TASK_UNCLAIM: 'userTask.unclaim';
  USER_TASK_ASSIGN: 'userTask.assign';
  USER_TASK_UNASSIGN: 'userTask.unassign';
  WORKFLOW_NAVIGATE_TO_WORKFLOW: 'workflow.navigateToWorkflow';
  WORKFLOW_GET_USER_TASKS: 'workflow.getUserTasks';
  PAGE_SEND_TO: 'page.sendTo';
  PAGE_SUBSCRIBE: 'page.subscribe';
  PAGE_UNSUBSCRIBE: 'page.unsubscribe';
  COCKPIT_SHOW_NOTIFICATION: 'cockpit.showNotification';
  COCKPIT_OPEN_DIALOG: 'cockpit.openDialog';
  COCKPIT_CLOSE_DIALOG: 'cockpit.closeDialog';
}>;
export type BcErrorCode = 'UNKNOWN_ACTION' | 'REFUSED' | 'FAILED' | 'NO_TARGET' | 'TIMEOUT' | 'DISCONNECTED';
export declare const ERROR_CODES: Readonly<{ [Code in BcErrorCode]: Code }>;
export declare const DEFAULT_TIMEOUT_MS: 30000;
export declare const ACTIONS_WITHOUT_TIMEOUT: readonly string[];

/** The detail of a `bc-request` event. */
export interface BcRequest {
  requestId: string;
  action: string;
  args: Record<string, unknown>;
}

/** The detail of a `bc-response` event. */
export type BcResponse =
  | { requestId: string; ok: true; result?: unknown }
  | { requestId: string; ok: false; error: { code: BcErrorCode | string; status?: number; message?: string } };

/** The detail of a `bc-message` event. */
export interface BcMessage {
  subscriptionId: string;
  from: string;
  message: unknown;
}

export declare class BcRequestError extends Error {
  readonly code: BcErrorCode | string;
  readonly status?: number;
  readonly action: string;
  constructor(details: { code: string; message?: string; status?: number; action: string });
}

export interface BcSubscription {
  /** Resolves once the cockpit delivers messages to this area. */
  ready: Promise<void>;
  /** Stops the delivery. */
  unsubscribe: () => Promise<void>;
}

export interface BcPageMessaging {
  sendTo: (target: string, message: unknown) => Promise<void>;
  receiveMessage: (handler: (message: unknown, from: string) => void) => BcSubscription;
}

export type BcUserTask<U = GuiApiData> = U & BcPageMessaging & {
  open: () => Promise<void>;
  navigateToWorkflow: () => Promise<void>;
  assign: (userId: string) => Promise<void>;
  unassign: (userId: string) => Promise<void>;
  claim: () => Promise<void>;
  unclaim: () => Promise<void>;
};

export type BcWorkflow<W = GuiApiData, U = GuiApiData> = W & BcPageMessaging & {
  navigateToWorkflow: () => Promise<void>;
  getUserTasks: (activeOnly: boolean, limitListAccordingToCurrentUsersPermissions: boolean) => Promise<Array<BcUserTask<U>>>;
};

export interface BcNotification {
  level: 'info' | 'success' | 'warning' | 'error';
  /** In the language the part got as 'language'. */
  text: string;
  /** true: stays until the user clicks it away. */
  sticky?: boolean;
}

export declare function requestFromCockpit(element: EventTarget, action: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
export declare function rejectOpenRequests(element: EventTarget): void;
export declare function sendTo(element: EventTarget, target: string, message: unknown): Promise<void>;
export declare function receiveMessage(element: EventTarget, handler: (message: unknown, from: string) => void): BcSubscription;
export declare function showNotification(element: EventTarget, notification: BcNotification): Promise<void>;
export declare function openDialog(element: EventTarget, dialog: BcElementRef, data?: unknown): Promise<unknown>;
export declare function closeDialog(element: EventTarget, result?: unknown): Promise<void>;
export declare function toBcUserTask<U extends GuiApiData>(element: EventTarget, data: U): BcUserTask<U>;
export declare function toBcWorkflow<W extends GuiApiData>(element: EventTarget, data: W): BcWorkflow<W>;

// --- web components --------------------------------------------------------------------------

/** What `mount` and `update` get: the properties the cockpit set, and the functions of the cockpit. */
export interface BcElementProps {
  /** On the page of a user task. */
  userTask?: BcUserTask;
  /** On the page of a case. */
  workflow?: BcWorkflow;
  /** The area of a page, or 'all' for an all-in-one form. */
  area?: string;
  language?: string;
  currentUser?: GuiApiData;
  /** For parts outside the pages of a user task and a case: id, version, uri. */
  workflowModule?: { id: string; version?: string; uri?: string };
  /** For a dialog: what `openDialog` handed over. */
  data?: unknown;
  /** The web component itself. */
  element: HTMLElement;
  showNotification: (notification: BcNotification) => Promise<void>;
  openDialog: (dialog: BcElementRef, data?: unknown) => Promise<unknown>;
  closeDialog: (result?: unknown) => Promise<void>;
  sendTo: (target: string, message: unknown) => Promise<void>;
  receiveMessage: (handler: (message: unknown, from: string) => void) => BcSubscription;
  /** Any further action, for example one of an extension point of this cockpit. */
  request: (action: string, args?: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>;
  [property: string]: unknown;
}

export interface BcElementFunctions {
  mount: (root: ShadowRoot, props: BcElementProps) => void;
  update?: (root: ShadowRoot, props: BcElementProps) => void;
  unmount?: (root: ShadowRoot) => void;
}

export declare const HOST_PROPERTIES: readonly string[];
export declare function defineBcElement(name: string, functions: BcElementFunctions, options?: { properties?: string[] }): CustomElementConstructor;
