#!/usr/bin/env node
// Sets the version of both published packages, and the host's dependency on the kit,
// to the version given as the only argument. The publish workflow calls it, so the
// version in the repository can stay '<next>-SNAPSHOT' between releases.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node bin/set-version.mjs <version>');
  process.exit(1);
}

const update = (file, change) => {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  change(json);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
};

update('packages/bc-module-kit/package.json', (kit) => {
  kit.version = version;
});
update('packages/bc-module-host/package.json', (host) => {
  host.version = version;
  // the host is tested against the kit of the same commit, so it names exactly that version
  host.dependencies['@vanillabp/bc-module-kit'] = version;
});
console.log(`Both packages are now at ${version}.`);
