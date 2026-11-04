import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('the package', () => {
  it('PKG-006 has no dependencies and no peer dependencies', () => {
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      assert.equal(pkg[field], undefined, field);
    }
  });

  it('ships bc-check-entries as a bin script', () => {
    assert.equal(pkg.bin['bc-check-entries'], 'bin/bc-check-entries.js');
  });

  it('PKG-020 the browser part imports nothing but its own files', async () => {
    for (const file of ['index.js', 'entries.js', 'manifest.js', 'protocol.js', 'define-element.js']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) assert.ok(specifier.startsWith('./'), `${file} imports ${specifier}`);
    }
  });
});
