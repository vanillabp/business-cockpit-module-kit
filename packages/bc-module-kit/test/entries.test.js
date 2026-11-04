import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DATA_ENTRIES, EXPORT_NAMES } from '../src/index.js';

describe('the entries', () => {
  it('PKG-023 DATA_ENTRIES names the four minimum entries and Header and Pages', () => {
    assert.deepEqual([...DATA_ENTRIES], ['UserTaskList', 'WorkflowList', 'UserTaskForm', 'WorkflowPage', 'Header', 'Pages']);
    assert.ok(Object.isFrozen(DATA_ENTRIES));
  });

  it('EXT-027 no entry name has "./" in front', () => {
    for (const name of DATA_ENTRIES) assert.ok(!name.startsWith('./'));
  });

  it('knows the name of the function every data entry exports', () => {
    assert.deepEqual(Object.keys(EXPORT_NAMES), [...DATA_ENTRIES]);
    assert.equal(EXPORT_NAMES.UserTaskForm, 'userTaskForm');
  });
});
