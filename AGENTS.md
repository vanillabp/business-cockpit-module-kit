# Working on business-cockpit-module-kit

The module kit of the VanillaBP Business Cockpit: the side of the contract a workflow module
fulfils, and a minimal host to test it. Read [`README.md`](./README.md) first.

## What belongs here

The contract itself is described in the skill `business-cockpit-user-interface` of the
[business-cockpit](https://github.com/vanillabp/business-cockpit) repository, in
`references/module-loading.md` and `references/types.md`. Where the kit and the skill disagree, one
of them has a bug. Fix both in the same week, and say in the pull request which one was right.

- `packages/bc-module-kit` holds only what every cockpit shares with every module: the manifest,
  `bc-check-entries`, the event protocol, `defineBcElement` and the names of the entries. Something
  only one organisation's cockpit knows, like its `ui-uri-type` values or its own extension points,
  goes into that cockpit's types library, not here. The kit is the minimum every cockpit keeps:
  the four data entries, the area `all`, the manifest, the event protocol, `defineBcElement` and
  `bc-check-entries`. `Header`, `Pages` and areas like `body` or `actions` differ from one
  organisation to the next, so they stay out of the kit's constants.
- `bc-module-kit` has no dependencies and no peer dependencies (`PKG-006`). The generated types
  library takes it in when it is built, and it must stay without dependencies as well.
- The files below `packages/bc-module-kit/src` which a browser loads import nothing but each other.
  `src/check.js` and `bin/` are for Node.js and may use `node:` modules.
- `packages/bc-module-host` is for tests, not for production. Keep it small. It shows what a cockpit
  does, so a module author can read it in one sitting.
- `examples/` holds two example modules, React and Vue. They are private and never published as
  npm packages. Built, they are part of `dist/conformance`, the test a generated cockpit runs.
- `conformance/` holds that test. It runs against any cockpit, so it only uses what the minimum
  promises.

## Tests

Unit tests use the test runner of Node.js 24. The browser tests use Playwright with Chromium. They
load both example modules side by side through the host, with and without areas, and run the
conformance test against the host. `npm test` runs all of them. A test that proves
an item of the checklist in the skill names its id in the title, for example
`EXT-030 fetches every file of a module at most once`.

## How we write

Most people who read this repository read English as a second language, and so does the
maintainer. Long sentences, rare words and stacked nouns slow them down. Write so that
nobody has to read a sentence twice.

Short main sentences, one thought each. One subordinate clause is enough. Active voice.
The common word instead of the rare one: `use` instead of `leverage`, `about` instead of
`regarding`, `so` instead of `consequently`, `has` instead of `possesses`. A technical term
stays a technical term, but say what it means the first time it turns up, and write an
abbreviation out once. If a sentence trips you up when you read it aloud, rewrite it.

This holds for every English text here: the README files, this file, the JSDoc and the
comments which explain something, in the main code and in the tests, the messages of
`bc-check-entries` and of the host, and the texts of commits and pull requests.

Nothing a program reads is renamed for the sake of language. Function and constant names,
event and action names, entry names and package names stay as they are, because modules,
cockpits and other repositories point at them.

Before and after, from the `business-cockpit` repository:

> What a pull request is checked by is two jobs beside each other.

becomes

> A pull request is checked by two jobs which run beside each other.

> The BPMS' own event id is deliberately not part of the key, and no clock reading is - version 1
> built an event id from `System.nanoTime()`, which made every repetition a new event.

becomes

> The BPMS' own event id is deliberately left out of the key, and so is any clock reading.
> Version 1 built an event id from `System.nanoTime()`, which turned every repetition into a new
> event.

> A result type `UserTaskDetails` is expected. The effected task-id can be passed by defining a
> parameter annotated by `@TaskId`.

becomes

> The method returns `UserTaskDetails`. To get the id of the task, add a parameter annotated with
> `@TaskId`.
