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
1. [The kit](#the-kit)
1. [Checking a module's build](#checking-a-modules-build)
1. [The host](#the-host)
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

## The kit

```bash
npm install --save-dev @vanillabp/bc-module-kit
```

A module has two kinds of entries. A data entry is minimal JavaScript without a framework. It tells
the cockpit something, for example which form a user task gets. A visual entry defines the web
components which draw the form, in whatever framework the module uses.

A data entry names the web components as strings and imports no form:

```js
// UserTaskForm: plain JavaScript
export const userTaskForm = (userTask) => {
  if (userTask.taskDefinition !== 'confirmRide') return undefined;
  return {
    entry: 'ConfirmRideForm',
    element: { body: 'taxi-ride-confirm-ride-body', actions: 'taxi-ride-confirm-ride-actions' },
  };
};
```

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

| Property            | What it is |
|---------------------|------------|
| `userTask`          | on the page of a user task: the data plus `open`, `navigateToWorkflow`, `claim`, `unclaim`, `assign`, `unassign`, `sendTo` and `receiveMessage` |
| `workflow`          | on the page of a case: the data plus `navigateToWorkflow`, `getUserTasks`, `sendTo` and `receiveMessage` |
| `area`              | the area of the page, or `all` for an all-in-one form |
| `language`          | the language the cockpit shows, for example `en` |
| `currentUser`       | the user who is logged in |
| `workflowModule`    | for parts outside the two pages: `id`, `version` and `uri` |
| `data`              | for a dialog: what `openDialog` handed over |
| `showNotification`  | shows a toast in the cockpit |
| `openDialog`        | shows a web component in a modal dialog and resolves with what it closed with |
| `closeDialog`       | closes the dialog this web component is shown in |
| `sendTo`            | sends a message to the web component of another area of the page |
| `receiveMessage`    | receives the messages for this area |
| `request`           | any other action, for example one of an extension point of your cockpit |

Every function returns a promise. A request without an answer fails after 30 seconds with the code
`TIMEOUT`. `openDialog` waits for ever, because it waits for the user. When the web component leaves
the page, its open requests fail with `DISCONNECTED`.

What else the kit exports:

| Export                                                                  | What it is |
|-------------------------------------------------------------------------|------------|
| `USER_TASK_LIST`, `WORKFLOW_LIST`, `USER_TASK_FORM`, `WORKFLOW_PAGE`, `HEADER`, `PAGES` | the names of the data entries |
| `DATA_ENTRIES`, `EXPORT_NAMES`                                          | all data entries, and the name of the function each one exports |
| `AREA_BODY`, `AREA_INFORMATION`, `AREA_ACTIONS`, `AREA_ALL`             | the areas of a page |
| `readManifest`, `checkManifest`, `createManifest`, `entryUrl`           | reading, checking and writing `bc-manifest.json` |
| `REQUEST_EVENT`, `RESPONSE_EVENT`, `MESSAGE_EVENT`, `ACTIONS`, `ERROR_CODES` | the names of the event protocol |
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

[`examples/build-module.mjs`](./examples/build-module.mjs) does this with esbuild, for both example
modules.

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

A cockpit with extension points of its own names their data entries with `--data-entry <name>`, once
per entry. Visual entries are only checked for their file. They may be as large as their framework
makes them.

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

The steps are also there on their own: `host.ask(moduleId, entry, args)`,
`host.load(moduleId, entry, elementNames)` and `host.draw({ moduleId, entry, element, container })`.
A failed step throws a `BcHostError` which names the step, the module, the entry and, where it
applies, the web component.

## Building and testing this repository

You need Node.js 24.

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` runs the unit tests with the test runner of Node.js, builds the two example modules and
runs the browser test. The browser test loads one example module, written once in React and once in
Vue, side by side through the host, in Chromium. To use a Chromium of your own, set
`BC_CHROMIUM_PATH`.

| Script                  | What it does |
|-------------------------|--------------|
| `npm run test:unit`     | the unit tests of both packages |
| `npm run build:examples`| builds `examples/react-module` and `examples/vue-module` into their `dist` folders and runs `bc-check-entries` on them |
| `npm run test:browser`  | builds the examples and runs the browser test |

## License

Copyright 2026 Phactum Softwareentwicklung GmbH

Licensed under the Apache License, Version 2.0
