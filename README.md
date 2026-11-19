# VanillaBP Business Cockpit module kit

[![Apache License V.2](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

A workflow module shows its forms and pages inside the
[VanillaBP Business Cockpit](https://github.com/vanillabp/business-cockpit). The cockpit loads them at
runtime as plain ES modules with `import()`. Every organisation generates its own cockpit user
interface, so a module needs the contract without waiting for a cockpit. This repository holds it, in
two npm packages:

| Package                     | What it is |
|-----------------------------|------------|
| `@vanillabp/bc-module-kit`  | The module's side of the contract: `bc-manifest.json`, `bc-check-entries`, the event protocol, `defineBcElement`, the names of the entries and the names of the web components. Plain JavaScript, no dependencies. |
| `@vanillabp/bc-module-host` | A minimal host which loads the parts of a module the way a cockpit does. For the tests of a module, not for production. |

The contract is described in the skill `business-cockpit-creator` of the `business-cockpit`
repository, in `references/module-loading.md` and `references/types.md`. A module which passes its
tests against this kit loads in every cockpit generated with that skill.

**Contents:**

1. [Who needs this kit](#who-needs-this-kit)
1. [The minimum and what an organisation adds](#the-minimum-and-what-an-organisation-adds)
1. [The kit](#the-kit)
1. [Checking a module's build](#checking-a-modules-build)
1. [An Angular module](#an-angular-module)
1. [The host](#the-host)
1. [Testing a generated cockpit](#testing-a-generated-cockpit)
1. [Building and testing this repository](#building-and-testing-this-repository)
1. [License](#license)

## Who needs this kit

The kit exists so that the [VanillaBP blueprints](https://github.com/vanillabp-blueprints) can show a
workflow module with a user interface, without a generated cockpit. A cockpit generated with the
skill brings its own types library. That library has the same contract plus what only this cockpit
knows, for example its own extension points. The module of an organisation builds against the types
library of its own cockpit, not against this kit.

If you start from a blueprint, replace `@vanillabp/bc-module-kit` by the types library of your
cockpit once you have one.

## The minimum and what an organisation adds

The kit is the minimum. Every generated cockpit keeps this part of the contract, so a module built
against the kit loads in every cockpit:

- the four data entries `UserTaskList`, `WorkflowList`, `UserTaskForm` and `WorkflowPage`, and the
  name of the function each one exports,
- the area `all`: the one web component which shows the whole page of a user task or a case,
- `bc-manifest.json`, the event protocol, `defineBcElement` and `bc-check-entries`,
- `elementPrefix` and `createElementNames`, which build the names of the web components. The
  cockpit refuses a name which does not start with the prefix of its module.

Everything else differs from one organisation to the next. The skill asks about it when it
generates the cockpit, and the types library of that cockpit names it:

| Extension point                                           | Who has it so far                                                              | What the skill proposes |
|-----------------------------------------------------------|--------------------------------------------------------------------------------|-------------------------|
| `Header`: buttons in the header of the cockpit            | every customer so far                                                          | yes |
| areas of a page, like `body`, `information` and `actions` | missing in the old cockpit, wanted by everybody                                | yes, but you may leave them out |
| `Pages`: pages of a module with their own menu entries    | nobody yet; an example is a page to maintain master data which a process needs | no |

A cockpit ignores entries and areas it does not know, without an error. A cockpit without areas
shows the web component of `all`. So a module may offer a `Header` entry and areas on top of the
minimum. In a cockpit without these extension points it still works, only without that part.

A data entry offers `all` and the areas side by side:

```js
// UserTaskForm: plain JavaScript
export const userTaskForm = (userTask) => {
  if (userTask.taskDefinition !== 'confirmRide') return undefined;
  return {
    entry: 'ConfirmRideForm',
    element: {
      all: 'taxi-ride-confirm-ride',          // every cockpit can show this one
      body: 'taxi-ride-confirm-ride-body',    // a cockpit with areas shows these instead
      actions: 'taxi-ride-confirm-ride-actions',
    },
  };
};
```

An entry of the module's own, like `Header`, needs `--data-entry Header` in
[`bc-check-entries`](#checking-a-modules-build).

## The kit

```bash
npm install --save-dev @vanillabp/bc-module-kit
```

A module has two kinds of entries. A data entry is minimal JavaScript without a framework. It tells
the cockpit something, for example which form a user task gets. A visual entry defines the web
components which draw the form, in whatever framework the module uses. The examples in this
repository use React, Vue and Angular.

A data entry names the web components as strings and imports no form:

```js
// UserTaskForm: plain JavaScript
export const userTaskForm = (userTask) => {
  if (userTask.taskDefinition !== 'confirmRide') return undefined;
  return { entry: 'ConfirmRideForm', element: 'taxi-ride-confirm-ride' };
};
```

One name is the web component for the area `all`. To offer areas as well, return an object, as
shown in [the section above](#the-minimum-and-what-an-organisation-adds).

A visual entry defines its web components with `defineBcElement`. The kit attaches an open shadow
root, reads the properties the cockpit sets and turns function calls into DOM events:

```jsx
// ConfirmRideForm: React
import { createRoot } from 'react-dom/client';
import { defineBcElement } from '@vanillabp/bc-module-kit';

const roots = new WeakMap();
defineBcElement('taxi-ride-confirm-ride-actions', {
  mount: (root, props) => {
    roots.set(root, createRoot(root));
    roots.get(root).render(<Actions {...props} />);
  },
  update: (root, props) => roots.get(root).render(<Actions {...props} />),
  unmount: (root) => roots.get(root).unmount(),
});

function Actions({ userTask, showNotification }) {
  const claim = async () => {
    await userTask.claim();
    await showNotification({ level: 'success', text: 'Claimed' });
  };
  return <button onClick={claim}>Claim</button>;
}
```

`mount` and `update` get the properties of the cockpit and its functions:

| Property           | What it is |
|--------------------|------------|
| `userTask`         | on the page of a user task: the data plus `open`, `navigateToWorkflow`, `claim`, `unclaim`, `assign`, `unassign`, `sendTo` and `receiveMessage` |
| `workflow`         | on the page of a case: the data plus `navigateToWorkflow`, `getUserTasks`, `sendTo` and `receiveMessage` |
| `area`             | the area of the page, or `all` for the web component which shows the whole page |
| `language`         | the language the cockpit shows, for example `en` |
| `currentUser`      | the user who is logged in |
| `workflowModule`   | for parts outside the two pages: `id`, `version` and `uri` |
| `data`             | for a dialog: what `openDialog` handed over |
| `showNotification` | shows a toast in the cockpit |
| `openDialog`       | shows a web component in a modal dialog and resolves with what it closed with |
| `closeDialog`      | closes the dialog this web component is shown in |
| `sendTo`           | sends a message to the web component of another area of the page |
| `receiveMessage`   | receives the messages for this area |
| `request`          | any other action, for example one of an extension point of your cockpit |

Every function returns a promise. A request without an answer fails after 30 seconds with the code
`TIMEOUT`. `openDialog` waits for ever, because it waits for the user. When the web component leaves
the page, its open requests fail with `DISCONNECTED`.

What else the kit exports:

| Export                                                                                                                            | What it is |
|-----------------------------------------------------------------------------------------------------------------------------------|------------|
| `USER_TASK_LIST`, `WORKFLOW_LIST`, `USER_TASK_FORM`, `WORKFLOW_PAGE`                                                              | the names of the four data entries every cockpit knows |
| `EXPORT_NAMES`, `DATA_ENTRIES`                                                                                                    | the name of the function each of these four exports, and the four names, which are the keys of `EXPORT_NAMES` |
| `AREA_ALL`                                                                                                                        | the area `all`, which every cockpit knows |
| `readManifest`, `checkManifest`, `createManifest`, `entryUrl`                                                                     | reading, checking and writing `bc-manifest.json` |
| `REQUEST_EVENT`, `RESPONSE_EVENT`, `MESSAGE_EVENT`, `ACTIONS`, `ERROR_CODES`                                                      | the names of the event protocol |
| `requestFromCockpit`, `toBcUserTask`, `toBcWorkflow`, `sendTo`, `receiveMessage`, `showNotification`, `openDialog`, `closeDialog` | the event protocol without `defineBcElement` |
| `elementPrefix`, `createElementNames`                                                                                             | the names of the web components, see [below](#the-names-of-the-web-components) |

`EXPORT_NAMES` is the one source of the data entries. Every entry which exports a function is a data
entry, and a visual entry exports no function. `DATA_ENTRIES` is derived from it: its keys, in the
same order. A cockpit with more entries, like `Header` or `Pages`, extends the map in its own types
library and does not change the kit:

```js
import { EXPORT_NAMES as KIT_EXPORT_NAMES } from '@vanillabp/bc-module-kit';

export const HEADER = 'Header';
export const PAGES = 'Pages';

export const EXPORT_NAMES = Object.freeze({
  ...KIT_EXPORT_NAMES,
  [HEADER]: 'header',
  [PAGES]: 'pages',
});
export const DATA_ENTRIES = Object.freeze(Object.keys(EXPORT_NAMES));
```

A module which uses such an entry names it with `--data-entry` in `bc-check-entries`, and a test
page hands the extra entries to the host with `entries`, for example `entries: { Header: 'header' }`.

The types are in `src/index.d.ts`. The JSON schema of the manifest is
`@vanillabp/bc-module-kit/schema/bc-manifest.schema.json`.

### The names of the web components

All modules define their web components in the one `customElements` registry of the page. So every
name has three parts:

```text
taxi-ride-mvaro4w0-taxi-ride--assess-risk--form
└ prefix ┘└ build ┘└ short name ────────────┘
```

- The prefix comes from the module id and keeps the modules apart. The cockpit refuses a name which
  does not start with the prefix of its module and a hyphen.
- The build id is new for every build and keeps the builds of one module apart. The browser can
  define a name only once per page, and `import()` keeps a file per address until the page is
  reloaded. With new names a new build of the module loads while the user has the cockpit open.
  A name without a build id still works, but after a new build the user has to reload the page.
- The short name holds the BPMN ids of the workflow or the user task, so it is unique within the
  module.

`elementPrefix(workflowModuleId)` turns a module id into the prefix. The cockpit uses the same rules
to check the names:

1. A hyphen goes between a lower case letter or a digit and an upper case letter after it.
2. Every letter becomes lower case.
3. Each run of characters other than `a` to `z`, `0` to `9` and `-` becomes one hyphen. Hyphens at
   the start and at the end are removed.
4. If the result is empty or does not start with a letter, `wm-` goes in front of it.

|     Module id     |      Prefix       |
|-------------------|-------------------|
| `taxi-ride`       | `taxi-ride`       |
| `TaxiRide`        | `taxi-ride`       |
| `loan_approval.2` | `loan-approval-2` |
| `4711`            | `wm-4711`         |

`createElementNames(workflowModuleId, buildId)` returns an object with three functions. Each one
returns a whole name:

|                     Call                     |                        Name                       |
|----------------------------------------------|---------------------------------------------------|
| `userTask('TaxiRide', 'assessRisk', 'form')` | `taxi-ride-mvaro4w0-taxi-ride--assess-risk--form` |
| `workflow('TaxiRide', 'page')`               | `taxi-ride-mvaro4w0-taxi-ride--page`              |
| `custom('price-chart')`                      | `taxi-ride-mvaro4w0-price-chart`                  |

The short name is made of segments. A segment has lower case letters and digits, with one hyphen
between two words. It never has `--` and never starts or ends with a hyphen. Two hyphens, `--`, go
between two segments:

- `workflow(bpmnProcessId, part)` gives `<process>--<part>`, one `--`.
- `userTask(bpmnProcessId, taskDefinition, part)` gives `<process>--<task>--<part>`, two `--`.
- `custom(shortName)` gives the short name as it is, no `--`. Use it for anything which is not
  the part of one workflow or one user task.

So the short name, split at `--`, gives back the process, the task and the part. Two different
processes, tasks or parts never get the same name. With a single hyphen they could:
`assessRisk` + `form` and `assess` + `risk-form` would both give `assess-risk-form`.

The BPMN process id and the task definition become segments by the rules of the prefix, with two
changes. In step 3 a run of hyphens becomes one hyphen as well. And step 4 does not apply: an id
which has no letter and no digit is refused with a `TypeError`. The part and the custom short name
are not changed. They must be segments already, or the call throws a `TypeError`.

Two BPMN ids which differ only in case or in characters which become a hyphen give the same name.
`assess_risk` and `assessRisk` both give `assess-risk`. If a module has both, `defineBcElement`
throws for the second one, because its name is defined already. Give one of them another id.

Call `createElementNames` once, in a small file of plain JavaScript which the data entries and the
visual entries import:

```js
// src/element-names.js
import { createElementNames } from '@vanillabp/bc-module-kit';
import { WORKFLOW_MODULE_ID, BUILD_ID } from './bc-build.js';

export const names = createElementNames(WORKFLOW_MODULE_ID, BUILD_ID);
```

The data entry returns `names.userTask('TaxiRide', 'confirmRide', 'form')`, and the visual entry
calls `defineBcElement(names.userTask('TaxiRide', 'confirmRide', 'form'), { mount, update, unmount })`.

The build script writes `bc-build.js` before it starts the bundler:

```js
import { writeFileSync } from 'node:fs';

const buildTime = Date.now();
writeFileSync('src/bc-build.js', [
  `export const WORKFLOW_MODULE_ID = 'taxi-ride';`,
  `export const BUILD_ID = '${buildTime.toString(36)}';`,
  '',
].join('\n'));
```

- `WORKFLOW_MODULE_ID` is the id the module registers with at the cockpit. Take it from the module's
  own configuration, for example a field in its `package.json`. If it differs from the id of the
  registration, the cockpit refuses every name of the module.
- `BUILD_ID` is the time of the build in milliseconds, written in base 36. It has only lower case
  letters and digits. Pass the same time to `createManifest` as `buildTimestamp`, so the manifest and
  the names speak of one build.

The example modules in this repository still write their names by hand, without a build id.

### The manifest

The build of a module writes `bc-manifest.json` next to its entries. Write it from the bundler's own
list of outputs, so the file names carry the hash of their content:

```js
import { writeFileSync } from 'node:fs';
import { createManifest } from '@vanillabp/bc-module-kit';

const manifest = createManifest({
  buildVersion: '1.4.0',
  entries: {
    UserTaskForm: 'entries/UserTaskForm-UYSINBVG.js',
    ConfirmRideForm: 'entries/ConfirmRideForm-W6KMBTHT.js',
  },
});
writeFileSync('dist/bc-manifest.json', JSON.stringify(manifest, null, 2));
```

[`examples/build-module.mjs`](./examples/build-module.mjs) does this with esbuild, for the React and
the Vue example. The Angular example builds with the Angular CLI, see
[An Angular module](#an-angular-module).

## Checking a module's build

Run `bc-check-entries` after the build:

```bash
npx bc-check-entries dist/bc-manifest.json --limit 32kb --metafile dist/meta.json
```

It fails the build when

- an entry the manifest names has no file,
- a data entry, together with every file it imports, is larger than the limit (32 KB by default,
  1 KB is 1024 bytes),
- a data entry imports a bare name like `react`, or a file outside the folder of the manifest,
- a data entry contains code of a framework, found by the markers React, Vue, Angular, `zone.js` and
  Lit leave in a bundle, and by the inputs of esbuild's metafile when you pass it.

The data entries are the keys of `EXPORT_NAMES`. A module with data entries of its own, for example
`Header`, names them with `--data-entry <name>`, once per entry. Visual entries are only checked for their file. They may be as large as their framework
makes them.

## An Angular module

[`examples/angular-module`](./examples/angular-module) is the same module as the React and the Vue
example, written in Angular 22. Its components are standalone components with signals. The module
starts one Angular application for all of its web components, without zone.js: signals and the
events of a template tell Angular when to draw again.

Each web component is defined with `defineBcElement`, as in the other examples. A small helper,
[`angular-element.ts`](./examples/angular-module/src/angular-element.ts), creates the component in
the shadow root with `createComponent` and hands it all properties of the cockpit as one input,
`props`. We did not use `@angular/elements`. It defines a web component class of its own, so the
module would have to build the event protocol a second time: the functions in the properties, the
end of all subscriptions and the `DISCONNECTED` answers when the web component leaves the page.
With `defineBcElement` an Angular module behaves exactly like the other two.

The components keep their styles in `styles`, as Angular components usually do. The helper puts
the host element into the shadow root before it creates the component. Angular then writes the
styles into that shadow root, so they reach the component and never reach the cockpit. A host
element outside a shadow root would send them into the head of the page instead. So would a single
component created through a `ViewContainerRef`, for example with `NgComponentOutlet`: Angular
creates its host element outside the page, and from then on writes every style of the module into
the head as well. A module which needs such components writes its style into each shadow root
itself and gives its components no styles.

The module builds with the Angular CLI and its `application` builder from `@angular/build`, the
way every Angular project builds. The CLI compiles the components ahead of time, so the browser
gets no template compiler. [`angular.json`](./examples/angular-module/angular.json) asks for no
`index.html` and no polyfills. Its entry point,
[`src/entries.ts`](./examples/angular-module/src/entries.ts), holds one `import()` per entry. The
CLI writes each of them as an ES module of its own with a hash in its name, and puts Angular into
a chunk the visual entries share. With `statsJson` it also writes its list of outputs.
[`scripts/write-manifest.mjs`](./examples/angular-module/scripts/write-manifest.mjs) takes the file
of each entry from that list, writes `bc-manifest.json` and runs `bc-check-entries`. The data
entries are plain JavaScript, so `bc-check-entries` finds no Angular in them.

## The host

```bash
npm install --save-dev @vanillabp/bc-module-host
```

The host does what a cockpit does to load the parts of a module, and nothing else: a registry of
modules, one loader which reads `/wm/<id>/bc-manifest.json` with `cache: 'no-cache'` and calls
`import()` once per module and entry, the three steps ask, load and draw, and the cockpit's side of
the event protocol. A test page of a module uses it like this:

```js
import { BcRefusedError, createModuleHost } from '@vanillabp/bc-module-host';

const host = createModuleHost({
  modules: [{ id: 'taxi-ride', uri: '/wm/taxi-ride' }],
  areas: ['body', 'actions'],      // leave it out for a cockpit with the minimum only
  entries: { Header: 'header' },   // entry -> exported function, beyond the four of the kit
  properties: { language: 'en', currentUser: { id: 'anna' } },
  actions: {
    'userTask.claim': ({ userTaskId }) => { /* record it */ },
    'userTask.unclaim': () => { throw new BcRefusedError(409, 'somebody else has it'); },
  },
});

const part = await host.showUserTask('taxi-ride', userTask, document.querySelector('#page'));
part.update({ userTask: changedUserTask });
part.remove();
```

The host brings the actions of the page (`page.sendTo`, `page.subscribe`, `page.unsubscribe`) and of
the dialog (`cockpit.openDialog`, `cockpit.closeDialog`) itself. Every other action comes from
`actions`. An action it does not know is answered with `UNKNOWN_ACTION`. A container with children
like `<div data-bc-area="body">` gets each web component in its area; any other container gets them
one after the other.

By default the host is a cockpit with the minimum only: the four entries of the kit and the area
`all`. With `areas` it draws the areas it knows and ignores the others. When a module offers none
of its areas, or the host has none, it draws the web component of `all`. With `entries` it asks
more data entries. Each one maps the name of the entry to the name of the function it exports, for
example `{ Header: 'header' }`, the same way `EXPORT_NAMES` does. It does not load an entry it does not know, and
`host.ask` answers `undefined` for it. So one module can be tested against a cockpit with areas
and a header and against one with the minimum only.

The steps are also there on their own: `host.ask(moduleId, entry, args)`,
`host.load(moduleId, entry, elementNames)` and `host.draw({ moduleId, entry, element, container })`.
A failed step throws a `BcHostError` which names the step, the module, the entry and, where it
applies, the web component.

### A new build of a module

The host notices a new build of a module the way a cockpit does, so a module can test it:

- Before it asks a part of a module, the host reads the manifest again when its last read is older
  than `MANIFEST_RECHECK_MS`, 60 seconds. It asks with `cache: 'no-cache'` and the ETag it has, so
  the module can answer `304 Not Modified`. A 304 keeps the build the host has.
- It compares `buildVersion` and `buildTimestamp` with the manifest it has. A manifest without both
  is compared by its files. When they differ, the host drops everything it loaded from the old
  build, calls `onNewBuild`, and loads the next part from the new build. Web components already on
  the page stay.
- When reading the manifest again fails, the host goes on with the build it has and tries again at
  the next ask.
- `host.load` does nothing when the current build defined every web component already: no
  `import()`, no waiting. When an earlier build of the module defined one of the names, a new
  visual entry cannot define it again. The host then loads nothing and throws a `BcHostError` with
  the code `ALREADY_DEFINED`. A cockpit shows a note that the module was updated, with a button that
  reloads the page.

A test sets `manifestRecheckMs` to a short time, so it sees a new build without waiting a minute:

```js
const host = createModuleHost({
  modules: [{ id: 'taxi-ride', uri: '/wm/taxi-ride' }],
  manifestRecheckMs: 300,
  onNewBuild: (moduleId, manifest, previous) => console.log(moduleId, previous.buildVersion, '->', manifest.buildVersion),
});
```

A new build loads without a reload of the page only when the names of its web components carry the
build id, see [The names of the web components](#the-names-of-the-web-components).

## Testing a generated cockpit

The skill checks a generated cockpit with the three example modules of this repository: a module
built against the kit loads in your cockpit. `npm run build:examples` and then
`npm run build:conformance` write a folder `dist/conformance`, which works on its own:

| File                                                       | What it is |
|------------------------------------------------------------|------------|
| `wm/react-module/`, `wm/vue-module/`, `wm/angular-module/` | the built example modules, each with its `bc-manifest.json` |
| `serve.mjs`                                                | a small web server for `wm/`; it prints the address of each module |
| `cockpit.test.js`                                          | the browser test, with Playwright and the test runner of Node.js |
| `package.json`                                             | its one dependency, `playwright` |

To run it against your cockpit:

1. `npm install` and `npx playwright install chromium` in the folder, then `node serve.mjs`.
1. Register `react-module`, `vue-module` and `angular-module` in your cockpit with the addresses
   `serve.mjs` printed.
1. Create a user task of each module with `bpmnProcessId` `TaxiRide` and `taskDefinition`
   `confirmRide`.
1. Run the test with the address of your cockpit and the pages of the three user tasks:

   ```bash
   BC_COCKPIT_URL=http://localhost:8080 \
   BC_USER_TASK_PAGES="react-module=/tasks/4711 vue-module=/tasks/4712 angular-module=/tasks/4713" \
   node --test cockpit.test.js
   ```

The test opens each page and works with the form: it finds it in an open shadow root, fills in the
comment, claims the task and opens a dialog. It passes for a cockpit with areas and for one
without. If your cockpit needs a login, save a logged-in session with Playwright and name the file
in `BC_STORAGE_STATE`.

`npm test` runs this test against a small cockpit made of the reference host, once with areas and
once without, so a failure points at the cockpit and not at the test.

## Building and testing this repository

You need Node.js 24.

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` runs the unit tests with the test runner of Node.js, builds the three example modules and
runs the browser tests. The browser tests load one example module, written in React, in Vue and in
Angular, side by side through the host, in Chromium: with areas, without areas, and with and without
the entry `Header`. They also deploy a new build of a small module while the page is open and check
that the next part comes from it, and that a 304 changes nothing. Then they run the conformance test against the reference host. To use a Chromium of
your own, set `BC_CHROMIUM_PATH`.

| Script                      | What it does |
|-----------------------------|--------------|
| `npm run test:unit`         | the unit tests of both packages |
| `npm run build:examples`    | builds `examples/react-module`, `examples/vue-module` and `examples/angular-module` into their `dist` folders and runs `bc-check-entries` on them |
| `npm run build:conformance` | writes `dist/conformance` from the built examples |
| `npm run test:browser`      | builds the examples and the conformance folder and runs the browser tests |

## Publishing

The workflow `Publish` is started by hand. It stages both packages on npmjs.com, and they become
public only when a maintainer approves them with two-factor authentication.

- `snapshot` stages `<version>-snapshot.<run number>` under the dist-tag `next`. Use it while the
  blueprints and a generated cockpit try the kit out. A project which wants a snapshot names the
  exact version; `npm install @vanillabp/bc-module-kit` without a version keeps getting the last
  release.
- `release` stages `<version>` under `latest` and tags the commit as `v<version>`. Afterwards raise
  the version in both `package.json` files to the next `-SNAPSHOT`.

`<version>` is the version in the `package.json` files without `-SNAPSHOT`. The workflow runs the
tests first and stages nothing from a red commit.

To approve, list what is staged and approve the kit before the host, because the host depends on
it:

```sh
npm stage list @vanillabp/bc-module-kit
npm stage approve <stage-id>
npm stage list @vanillabp/bc-module-host
npm stage approve <stage-id>
```

There is no npm token. Each package has this repository and `.github/workflows/publish.yaml` as
its trusted publisher on npmjs.com, allowed to stage, so npm trusts the workflow through OpenID
Connect and adds a provenance statement to each version. npm can only set up a trusted publisher
for a package that exists, so the very first version of each package was published by hand.

## License

Copyright 2026 Phactum Softwareentwicklung GmbH

Licensed under the Apache License, Version 2.0
