// Puts the conformance test into dist/conformance: the built example modules below wm/, the test,
// a small server for wm/ and a package.json. The folder works on its own, so a generated cockpit
// can take it in and run it. Run `npm run build:examples` before.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'dist', 'conformance');
const kit = JSON.parse(readFileSync(join(root, 'packages', 'bc-module-kit', 'package.json'), 'utf8'));
const { devDependencies } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
for (const id of ['react-module', 'vue-module']) {
  const dist = join(root, 'examples', id, 'dist');
  if (!existsSync(join(dist, 'bc-manifest.json'))) throw new Error(`${dist} has no bc-manifest.json; run npm run build:examples first`);
  cpSync(dist, join(out, 'wm', id), { recursive: true, filter: (file) => !file.endsWith('meta.json') });
}
for (const file of ['cockpit.test.js', 'serve.mjs']) cpSync(join(import.meta.dirname, file), join(out, file));
writeFileSync(join(out, 'package.json'), `${JSON.stringify({
  name: '@vanillabp/bc-module-conformance',
  version: kit.version,
  description: 'Checks that a module built against @vanillabp/bc-module-kit loads in a generated VanillaBP Business Cockpit.',
  license: 'Apache-2.0',
  type: 'module',
  engines: { node: '>=24' },
  scripts: { serve: 'node serve.mjs', test: 'node --test cockpit.test.js' },
  dependencies: { playwright: devDependencies.playwright },
}, null, 2)}\n`);
console.log(`The conformance test is in ${out}`);
