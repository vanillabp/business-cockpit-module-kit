# VanillaBP Business Cockpit module kit

[![Apache License V.2](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

A workflow module shows its forms and pages inside the
[VanillaBP Business Cockpit](https://github.com/vanillabp/business-cockpit). The cockpit loads them at
runtime as plain ES modules with `import()`. Every organisation generates its own cockpit user
interface, so a module needs the contract without waiting for a cockpit. This repository holds it, in
two npm packages:

| Package                     | What it is |
|-----------------------------|------------|
| `@vanillabp/bc-module-kit`  | The module's side of the contract: `bc-manifest.json`, `bc-check-entries`, the event protocol, `defineBcElement` and the names of the entries. Plain JavaScript, no dependencies. |
| `@vanillabp/bc-module-host` | A minimal host which loads the parts of a module the way a cockpit does. For the tests of a module, not for production. |

The contract is described in the skill `business-cockpit-user-interface` of the `business-cockpit`
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
- `bc-manifest.json`, the event protocol, `defineBcElement` and `bc-check-entries`.

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
| `DATA_ENTRIES`, `EXPORT_NAMES`                                                                                                    | these four, and the name of the function each one exports |
| `AREA_ALL`                                                                                                                        | the area `all`, which every cockpit knows |
| `readManifest`, `checkManifest`, `createManifest`, `entryUrl`                                                                     | reading, checking and writing `bc-manifest.json` |
| `REQUEST_EVENT`, `RESPONSE_EVENT`, `MESSAGE_EVENT`, `ACTIONS`, `ERROR_CODES`                                                      | the names of the event protocol |
| `requestFromCockpit`, `toBcUserTask`, `toBcWorkflow`, `sendTo`, `receiveMessage`, `showNotification`, `openDialog`, `closeDialog` | the event protocol without `defineBcElement` |

The types are in `src/index.d.ts`. The JSON schema of the manifest is
`@vanillabp/bc-module-kit/schema/bc-manifest.schema.json`.

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

[`examples/build-module.mjs`](./examples/build-module.mjs) does this with esbuild, for all three
example modules.

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

A module with data entries of its own, for example `Header`, names them with `--data-entry <name>`,
once per entry. Visual entries are only checked for their file. They may be as large as their framework
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

Angular puts the styles of a component into the head of the page, and from there they do not reach
into a shadow root. So the helper writes the module's style into the shadow root itself.

The build has two steps more than the other examples, both from Angular's own compiler
(`@angular/compiler-cli`):

1. The Angular compiler compiles the components ahead of time into plain JavaScript. The browser
   gets no template compiler.
1. Angular publishes its own packages half compiled. The Angular linker finishes them while esbuild
   bundles. The Angular CLI does the same.

The data entries are plain JavaScript and skip both steps, so `bc-check-entries` finds no Angular in
them. See [`build.mjs`](./examples/angular-module/build.mjs). Your module may build with the Angular
CLI instead, as long as the build writes one ES module per entry and `bc-manifest.json` next to them.

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
more data entries, for example `Header`. It does not load an entry it does not know, and
`host.ask` answers `undefined` for it. So one module can be tested against a cockpit with areas
and a header and against one with the minimum only.

The steps are also there on their own: `host.ask(moduleId, entry, args)`,
`host.load(moduleId, entry, elementNames)` and `host.draw({ moduleId, entry, element, container })`.
A failed step throws a `BcHostError` which names the step, the module, the entry and, where it
applies, the web component.

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
the entry `Header`. Then they run the conformance test against the reference host. To use a Chromium of
your own, set `BC_CHROMIUM_PATH`.

| Script                      | What it does |
|-----------------------------|--------------|
| `npm run test:unit`         | the unit tests of both packages |
| `npm run build:examples`    | builds `examples/react-module`, `examples/vue-module` and `examples/angular-module` into their `dist` folders and runs `bc-check-entries` on them |
| `npm run build:conformance` | writes `dist/conformance` from the built examples |
| `npm run test:browser`      | builds the examples and the conformance folder and runs the browser tests |

## Publishing

The workflow `Publish` is started by hand and publishes both packages to npmjs.com.

- `snapshot` publishes `<version>-snapshot.<run number>` under the dist-tag `next`. Use it while
  the blueprints and a generated cockpit try the kit out. A project which wants a snapshot names
  the exact version; `npm install @vanillabp/bc-module-kit` without a version keeps getting the
  last release.
- `release` publishes `<version>` under `latest` and tags the commit as `v<version>`. Afterwards
  raise the version in both `package.json` files to the next `-SNAPSHOT`.

`<version>` is the version in the `package.json` files without `-SNAPSHOT`. The workflow runs the
tests first and publishes nothing from a red commit.

There is no npm token. Each package has this repository and `.github/workflows/publish.yaml` as
its trusted publisher on npmjs.com, so npm trusts the workflow through OpenID Connect and adds a
provenance statement to each version. npm can only set up a trusted publisher for a package that
exists, so the very first version of each package was published by hand.

## License

Copyright 2026 Phactum Softwareentwicklung GmbH

Licensed under the Apache License, Version 2.0
