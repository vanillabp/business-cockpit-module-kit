import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import * as kit from '../src/index.js';
import { AREA_ALL, DATA_ENTRIES, EXPORT_NAMES } from '../src/index.js';

describe('the entries', () => {
  it('PKG-023 DATA_ENTRIES names the four minimum entries and nothing else', () => {
    assert.deepEqual([...DATA_ENTRIES], ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage']);
    assert.ok(Object.isFrozen(DATA_ENTRIES));
  });

  it('EXT-027 no entry name has "./" in front', () => {
    for (const name of DATA_ENTRIES) assert.ok(!name.startsWith('./'));
  });

  it('knows the name of the function every data entry exports', () => {
    assert.deepEqual(EXPORT_NAMES, {
      UserTaskList: 'userTaskListColumns',
      WorkflowList: 'workflowListColumns',
      UserTaskForm: 'userTaskForm',
      WorkflowPage: 'workflowPage',
    });
    assert.ok(Object.isFrozen(EXPORT_NAMES));
  });

  it('derives DATA_ENTRIES from the keys of EXPORT_NAMES', async () => {
    const source = await readFile(new URL('../src/entries.js', import.meta.url), 'utf8');
    assert.match(source, /export const DATA_ENTRIES = Object\.freeze\(Object\.keys\(EXPORT_NAMES\)\);/);
    assert.deepEqual([...DATA_ENTRIES], Object.keys(EXPORT_NAMES));
  });

  it('DATA_ENTRIES cannot be changed', () => {
    assert.ok(Object.isFrozen(DATA_ENTRIES));
    assert.throws(() => /** @type {string[]} */ (DATA_ENTRIES).push('Header'), TypeError);
  });

  it('knows the area all and no other area', () => {
    assert.equal(AREA_ALL, 'all');
    assert.deepEqual(Object.keys(kit).filter((name) => name.startsWith('AREA')), ['AREA_ALL']);
  });

  it('leaves the entries and areas a cockpit may add to the types library of that cockpit', () => {
    for (const name of ['HEADER', 'PAGES', 'AREA_BODY', 'AREA_INFORMATION', 'AREA_ACTIONS', 'AREAS']) {
      assert.equal(name in kit, false, name);
    }
  });
});
