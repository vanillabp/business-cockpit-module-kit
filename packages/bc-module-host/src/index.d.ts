import type { BcManifest, BcPageParts, GuiApiData } from '@vanillabp/bc-module-kit';

/** A workflow module as `GET /gui/api/v1/workflow-module` lists it. An empty `uri` means nothing to load. */
export interface WorkflowModule {
  id: string;
  version?: string;
  uri?: string;
}

/** What an action handler gets besides the `args` of the request. */
export interface ActionContext {
  moduleId: string;
  /** The area of the element that asked; 'all' for an all-in-one form. */
  area: string;
  element: HTMLElement;
}

/** Runs an action of the event protocol. Throw a `BcRefusedError` to answer with `REFUSED`. */
export type ActionHandler = (args: Record<string, any>, context: ActionContext) => unknown | Promise<unknown>;

export interface ModuleHostOptions {
  /** The address the module paths `/wm/<id>/` are resolved against; by default the page's address. */
  baseUrl?: string;
  /** The modules of the registry. Without them, `loadModules` gives the list. */
  modules?: WorkflowModule[];
  /** Like `GET /gui/api/v1/workflow-module`; called once. */
  loadModules?: () => WorkflowModule[] | Promise<WorkflowModule[]>;
  /** Like `GET /gui/api/v1/workflow-module/{id}`, for a module which registered later. */
  loadModule?: (moduleId: string) => WorkflowModule | undefined | Promise<WorkflowModule | undefined>;
  fetch?: typeof fetch;
  /** Replaces `import()`, for example in a test under Node.js. */
  importModule?: (url: string) => Promise<any>;
  /** How long the host waits for a web component; by default 10 seconds. */
  whenDefinedTimeoutMs?: number;
  /** The actions the host runs besides the page and dialog actions it brings itself. */
  actions?: Record<string, ActionHandler>;
  /** Properties every drawn web component gets, for example `language` and `currentUser`. */
  properties?: Record<string, unknown>;
  /**
   * Data entries this host knows besides the four of the kit: entry -> the name of the function
   * it exports, for example `{ Header: 'header' }`. The host asks no other entry.
   */
  entries?: Record<string, string>;
  /**
   * The areas of the page of a user task or a case, for example `['body', 'actions']`. The host
   * draws the areas it knows and ignores the others. Without areas, or when a module offers none
   * of them, it draws the web component of 'all'. By default there are none.
   */
  areas?: string[];
  /** Where dialogs go; by default `document.body`. */
  dialogContainer?: Element;
  logger?: Pick<Console, 'warn' | 'error'>;
}

/** The web components of one part in the page. */
export interface DrawnPart {
  /** Area -> web component. A form shown as one web component has the one area 'all'. */
  elements: Map<string, HTMLElement>;
  /** Sets properties on every web component again, for example a changed user task. */
  update(properties: Record<string, unknown>): void;
  /** Takes the web components out of the page and drops their subscriptions. */
  remove(): void;
}

export interface ModuleHost {
  registry: {
    load(): Promise<void>;
    list(): WorkflowModule[];
    get(moduleId: string): WorkflowModule | undefined;
    ensure(moduleId: string): Promise<WorkflowModule | undefined>;
  };
  readManifest(moduleId: string): Promise<BcManifest | undefined>;
  loadEntry(moduleId: string, entry: string): Promise<any>;
  /** The areas this host knows, besides 'all'. */
  readonly areas: readonly string[];
  /** The data entries this host asks. */
  readonly entries: readonly string[];
  /** Area -> web component: what `draw` shows of what a data entry offers. */
  pickAreas(element: BcPageParts['element']): Record<string, string>;
  /** undefined for an entry this host does not know, or which the module does not offer. */
  ask(moduleId: string, entry: string, args?: unknown[]): Promise<any>;
  load(moduleId: string, entry: string, elements: string[]): Promise<void>;
  draw(part: {
    moduleId: string;
    entry: string;
    element: BcPageParts['element'];
    container: Element;
    properties?: Record<string, unknown>;
  }): DrawnPart;
  showUserTask(moduleId: string, userTask: GuiApiData, container: Element, properties?: Record<string, unknown>): Promise<DrawnPart | undefined>;
  showWorkflow(moduleId: string, workflow: GuiApiData, container: Element, properties?: Record<string, unknown>): Promise<DrawnPart | undefined>;
}

export declare const DEFAULT_WHEN_DEFINED_TIMEOUT_MS: 10000;

export declare class BcHostError extends Error {
  readonly step: 'ask' | 'load' | 'draw';
  readonly moduleId: string;
  readonly entry?: string;
  readonly element?: string;
}

export declare class BcRefusedError extends Error {
  readonly code: 'REFUSED';
  readonly status: number;
  constructor(status: number, message?: string);
}

export declare function createModuleHost(options?: ModuleHostOptions): ModuleHost;
