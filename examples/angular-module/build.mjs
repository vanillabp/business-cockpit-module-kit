// Angular needs two steps on top of the other examples, both from Angular's own compiler:
// 1. The Angular compiler compiles the components ahead of time (AOT) into plain JavaScript in
//    .ngc/. So the browser gets no template compiler.
// 2. Angular publishes its own packages half compiled. The linker finishes them while esbuild
//    bundles, which is what the Angular CLI does as well.
// The data entries are plain JavaScript and skip both steps.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transformAsync } from '@babel/core';
import { formatDiagnostics, performCompilation, readConfiguration } from '@angular/compiler-cli';
import { needsLinking } from '@angular/compiler-cli/linker';
import angularLinker from '@angular/compiler-cli/linker/babel';
import { buildModule } from '../build-module.mjs';

const moduleDir = import.meta.dirname;

const { diagnostics } = performCompilation(readConfiguration(join(moduleDir, 'tsconfig.json')));
const errors = diagnostics.filter(({ category }) => category === 1);
if (errors.length > 0) throw new Error(`The Angular compiler failed:\n${formatDiagnostics(errors)}`);

/** @type {import('esbuild').Plugin} */
const linker = {
  name: 'angular-linker',
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]@angular[\\/].*\.m?js$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      if (!needsLinking(path, source)) return undefined;
      const { code } = await transformAsync(source, { filename: path, babelrc: false, configFile: false, compact: false, plugins: [angularLinker] });
      return { contents: code, loader: 'js' };
    });
  },
};

await buildModule(moduleDir, {
  UserTaskList: 'src/data/user-task-list.js',
  UserTaskForm: 'src/data/user-task-form.js',
  Header: 'src/data/header.js',
  ConfirmRideForm: '.ngc/confirm-ride-form.js',
  HeaderButtons: '.ngc/header-buttons.js',
}, ['Header'], {
  plugins: [linker],
  // Tells Angular's code that this is a production build without a template compiler, so the
  // bundler drops the parts for development.
  define: { ngDevMode: 'false', ngJitMode: 'false', ngI18nClosureMode: 'false' },
});
