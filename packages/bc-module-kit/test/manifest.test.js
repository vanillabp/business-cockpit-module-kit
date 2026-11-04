import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  BcManifestError,
  MANIFEST_FILE_NAME,
  checkManifest,
  createManifest,
  entryUrl,
  readManifest,
} from '../src/index.js';

const valid = {
  manifestVersion: 1,
  buildVersion: '1.4.0',
  buildTimestamp: '2026-10-16T09:30:00Z',
  entries: {
    UserTaskList: 'entries/user-task-list-3f9a1c2b.js',
    AssessRiskForm: 'entries/assess-risk-form-5c0e7a21.js?v=1.4.0',
  },
};

describe('the manifest', () => {
  it('has the fixed name bc-manifest.json', () => {
    assert.equal(MANIFEST_FILE_NAME, 'bc-manifest.json');
  });

  it('accepts the example of the description, from its text and as an object', () => {
    assert.deepEqual(checkManifest(valid), []);
    assert.deepEqual(readManifest(JSON.stringify(valid)), valid);
    assert.ok(Object.isFrozen(readManifest(valid).entries));
  });

  it('accepts a manifest without build version and timestamp, and fields it does not know', () => {
    assert.deepEqual(checkManifest({ manifestVersion: 1, entries: {}, comment: 'later' }), []);
  });

  it('refuses a higher manifest version it does not know', () => {
    assert.match(checkManifest({ ...valid, manifestVersion: 2 })[0], /only knows version 1/);
    assert.equal(checkManifest({ ...valid, manifestVersion: '1' }).length, 1);
  });

  it('refuses an entry name with "./" in front', () => {
    const problems = checkManifest({ manifestVersion: 1, entries: { './UserTaskList': 'a.js' } });
    assert.match(problems[0], /write "UserTaskList" instead/);
  });

  it('refuses files outside the web path of the module', () => {
    for (const file of ['https://cdn.example.com/a.js', '//cdn.example.com/a.js', '/wm/other/a.js', '../other/a.js', 'a/../../b.js', '']) {
      assert.equal(checkManifest({ manifestVersion: 1, entries: { UserTaskList: file } }).length, 1, file);
    }
  });

  it('lists every problem at once', () => {
    assert.throws(() => readManifest({ manifestVersion: 0, buildTimestamp: 'yesterday', entries: [] }), (error) => {
      assert.ok(error instanceof BcManifestError);
      assert.equal(error.problems.length, 3);
      return true;
    });
  });

  it('says so when the text is not JSON', () => {
    assert.throws(() => readManifest('{'), /not JSON/);
  });

  it('is created with the current version and a timestamp', () => {
    const manifest = createManifest({ entries: { UserTaskList: 'entries/a.js' }, buildVersion: '2.0.0', buildTimestamp: new Date('2026-11-04T10:00:00Z') });
    assert.deepEqual(manifest, { manifestVersion: 1, buildVersion: '2.0.0', buildTimestamp: '2026-11-04T10:00:00.000Z', entries: { UserTaskList: 'entries/a.js' } });
    assert.throws(() => createManifest({ entries: { './X': 'a.js' } }), BcManifestError);
  });

  it('resolves the file of an entry against the address of the manifest', () => {
    const manifest = readManifest(valid);
    const url = 'https://cockpit.example.com/wm/taxi-ride/bc-manifest.json';
    assert.equal(entryUrl(manifest, 'UserTaskList', url), 'https://cockpit.example.com/wm/taxi-ride/entries/user-task-list-3f9a1c2b.js');
    assert.equal(entryUrl(manifest, 'AssessRiskForm', url), 'https://cockpit.example.com/wm/taxi-ride/entries/assess-risk-form-5c0e7a21.js?v=1.4.0');
    assert.equal(entryUrl(manifest, 'Header', url), undefined);
    assert.equal(entryUrl(manifest, 'toString', url), undefined);
  });

  it('has a JSON schema which says the same about the example', () => {
    const schema = JSON.parse(readFileSync(new URL('../schema/bc-manifest.schema.json', import.meta.url), 'utf8'));
    assert.deepEqual(schema.required, ['manifestVersion', 'entries']);
    const filePatterns = schema.properties.entries.additionalProperties.not.anyOf.map(({ pattern }) => new RegExp(pattern));
    for (const file of Object.values(valid.entries)) assert.ok(!filePatterns.some((pattern) => pattern.test(file)), file);
    for (const file of ['https://x/a.js', '/a.js', '../a.js']) assert.ok(filePatterns.some((pattern) => pattern.test(file)), file);
  });
});
