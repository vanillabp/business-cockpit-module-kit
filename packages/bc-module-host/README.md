# @vanillabp/bc-module-host

A minimal host which loads the parts of a VanillaBP workflow module the way a Business Cockpit does:
a registry of modules, one loader for `bc-manifest.json` and `import()`, the steps ask, load and
draw, and the cockpit's side of the event protocol. It is for the tests of a module, not for
production.

How to use it is in the
[README of the repository](https://github.com/vanillabp/business-cockpit-module-kit#readme).
