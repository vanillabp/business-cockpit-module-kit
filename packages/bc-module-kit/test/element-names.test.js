import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElementNames, elementPrefix } from '../src/index.js';

describe('the names of the web components', () => {
  it('PKG-051 elementPrefix gives the prefixes of the examples in the skill', () => {
    assert.equal(elementPrefix('taxi-ride'), 'taxi-ride');
    assert.equal(elementPrefix('TaxiRide'), 'taxi-ride');
    assert.equal(elementPrefix('loan_approval.2'), 'loan-approval-2');
    assert.equal(elementPrefix('4711'), 'wm-4711');
  });

  it('puts a hyphen after a digit which an upper case letter follows', () => {
    assert.equal(elementPrefix('loan2Approval'), 'loan2-approval');
    assert.equal(elementPrefix('aBcD'), 'a-bc-d');
  });

  it('puts no hyphen between two upper case letters', () => {
    assert.equal(elementPrefix('XMLImport'), 'xmlimport');
  });

  it('turns each run of other characters into one hyphen and removes hyphens at both ends', () => {
    assert.equal(elementPrefix('  Taxi  Ride / Zürich!  '), 'taxi-ride-z-rich');
    assert.equal(elementPrefix('_taxi_'), 'taxi');
    assert.equal(elementPrefix('-taxi-ride-'), 'taxi-ride');
  });

  it('keeps hyphens which are in the module id already', () => {
    assert.equal(elementPrefix('taxi--ride'), 'taxi--ride');
  });

  it('puts wm- in front of a prefix which is empty or does not start with a letter', () => {
    assert.equal(elementPrefix(''), 'wm-');
    assert.equal(elementPrefix('...'), 'wm-');
    assert.equal(elementPrefix('2fa'), 'wm-2fa');
    assert.equal(elementPrefix('_4711'), 'wm-4711');
  });

  it('gives the same prefix for two ids which differ only in case and separators', () => {
    assert.equal(elementPrefix('TaxiRide'), elementPrefix('taxi_ride'));
  });

  it('refuses a module id which is not a string', () => {
    assert.throws(() => elementPrefix(undefined), TypeError);
    assert.throws(() => elementPrefix(4711), /must be a string, but it is 4711/);
  });

  const names = createElementNames('TaxiRide', 'mvaro4w0');

  it('PKG-052 names a user task part after the process, the task definition and the part', () => {
    assert.equal(names.userTask('TaxiRide', 'assessRisk', 'form'), 'taxi-ride-mvaro4w0-taxi-ride--assess-risk--form');
    assert.equal(names.userTask('TaxiRide', 'confirmRide', 'list-item'), 'taxi-ride-mvaro4w0-taxi-ride--confirm-ride--list-item');
  });

  it('PKG-053 names a workflow part after the process and the part', () => {
    assert.equal(names.workflow('TaxiRide', 'page'), 'taxi-ride-mvaro4w0-taxi-ride--page');
    assert.equal(names.workflow('TaxiRide', 'start-form'), 'taxi-ride-mvaro4w0-taxi-ride--start-form');
  });

  it('PKG-054 takes a custom short name as it is', () => {
    assert.equal(names.custom('price-chart'), 'taxi-ride-mvaro4w0-price-chart');
    assert.equal(names.custom('confirm'), 'taxi-ride-mvaro4w0-confirm');
  });

  it('returns a frozen plain object, not a function', () => {
    assert.equal(typeof names, 'object');
    assert.ok(Object.isFrozen(names));
    assert.deepEqual(Object.keys(names).sort(), ['custom', 'userTask', 'workflow']);
  });

  it('puts -- between two segments, so a workflow has one, a user task two and a custom name none', () => {
    const shortName = (name) => name.slice('taxi-ride-mvaro4w0-'.length);
    assert.deepEqual(shortName(names.workflow('TaxiRide', 'start-form')).split('--'), ['taxi-ride', 'start-form']);
    assert.deepEqual(shortName(names.userTask('TaxiRide', 'assessRisk', 'form')).split('--'), ['taxi-ride', 'assess-risk', 'form']);
    assert.deepEqual(shortName(names.custom('assess-risk-form')).split('--'), ['assess-risk-form']);
  });

  it('gives different names where a single hyphen would make them equal', () => {
    const all = [
      names.userTask('TaxiRide', 'assessRisk', 'form'),
      names.userTask('TaxiRide', 'assess', 'risk-form'),
      names.workflow('TaxiRide', 'assess-risk-form'),
      names.workflow('Taxi', 'ride-assess-risk-form'),
      names.userTask('Taxi', 'rideAssess', 'risk-form'),
      names.custom('taxi-ride-assess-risk-form'),
    ];
    assert.equal(new Set(all).size, all.length, all.join('\n'));
  });

  it('turns the BPMN ids into segments by the rules of the prefix and joins runs of hyphens', () => {
    assert.equal(names.workflow('taxi-ride', 'page'), 'taxi-ride-mvaro4w0-taxi-ride--page');
    assert.equal(names.workflow('Process_1x2y3z', 'page'), 'taxi-ride-mvaro4w0-process-1x2y3z--page');
    assert.equal(names.workflow('taxi--ride', 'page'), 'taxi-ride-mvaro4w0-taxi-ride--page');
    assert.equal(names.workflow('-_TaxiRide_-', 'page'), 'taxi-ride-mvaro4w0-taxi-ride--page');
    assert.equal(names.userTask('TaxiRide', 'XMLImport', 'form'), 'taxi-ride-mvaro4w0-taxi-ride--xmlimport--form');
    assert.equal(names.userTask('TaxiRide', '4711', 'form'), 'taxi-ride-mvaro4w0-taxi-ride--4711--form');
  });

  it('gives the same name for two BPMN ids which differ only in characters that become a hyphen', () => {
    assert.equal(names.userTask('TaxiRide', 'assess_risk', 'form'), names.userTask('TaxiRide', 'assessRisk', 'form'));
    assert.equal(names.userTask('taxi_ride', 'assess-risk', 'form'), names.userTask('TaxiRide', 'assessRisk', 'form'));
  });

  it('refuses a BPMN id which is not a string or has no letter and no digit, and names it', () => {
    assert.throws(() => names.workflow(undefined, 'page'), /BPMN process id must be a string/);
    assert.throws(() => names.workflow('___', 'page'), /BPMN process id "___" has no letter and no digit/);
    assert.throws(() => names.userTask('TaxiRide', '', 'form'), /task definition "" has no letter and no digit/);
    assert.throws(() => names.userTask('TaxiRide', 42, 'form'), /task definition must be a string, but it is 42/);
  });

  it('refuses a part or a custom short name which is not a segment', () => {
    for (const value of [undefined, '', 'Form', 'start_form', 'start form', 'start--form', '-form', 'form-', 'formulär']) {
      assert.throws(() => names.workflow('TaxiRide', value), TypeError, `workflow part ${value}`);
      assert.throws(() => names.userTask('TaxiRide', 'assessRisk', value), TypeError, `user task part ${value}`);
      assert.throws(() => names.custom(value), TypeError, `custom ${value}`);
    }
  });

  it('turns the module id into its prefix first', () => {
    assert.equal(createElementNames('taxi-ride', 'mvaro4w0').custom('confirm'), 'taxi-ride-mvaro4w0-confirm');
    assert.equal(createElementNames('4711', 'mvaro4w0').workflow('TaxiRide', 'page'), 'wm-4711-mvaro4w0-taxi-ride--page');
  });

  it('gives two builds of one module different names', () => {
    const before = createElementNames('taxi-ride', 'mvaro4w0');
    const after = createElementNames('taxi-ride', 'mvaro4w1');
    assert.notEqual(before.userTask('TaxiRide', 'assessRisk', 'form'), after.userTask('TaxiRide', 'assessRisk', 'form'));
    assert.notEqual(before.workflow('TaxiRide', 'page'), after.workflow('TaxiRide', 'page'));
    assert.notEqual(before.custom('confirm'), after.custom('confirm'));
  });

  it('gives two modules with the same prefix different names as long as their builds differ', () => {
    assert.notEqual(createElementNames('TaxiRide', 'a1').custom('confirm'), createElementNames('taxi-ride', 'a2').custom('confirm'));
  });

  it('accepts the build id of the skill, the time of the build in base 36', () => {
    const buildId = Date.parse('2026-10-16T09:30:00Z').toString(36);
    assert.equal(buildId, 'mvaro4w0');
    assert.equal(createElementNames('taxi-ride', buildId).custom('x'), 'taxi-ride-mvaro4w0-x');
  });

  it('gives a valid name of a custom element', () => {
    const name = createElementNames('Loan_Approval.2', 'mvaro4w0').userTask('Loan_Approval', 'assessRisk', 'form');
    assert.match(name, /^[a-z][a-z0-9-]*-[a-z0-9-]*$/);
  });

  it('refuses a build id which is missing or has other characters than lower case letters and digits', () => {
    for (const buildId of [undefined, '', 'MVARO4W0', 'mvaro-4w0', 'mvaro4w0 ', 1760607000000]) {
      assert.throws(() => createElementNames('taxi-ride', buildId), TypeError, String(buildId));
    }
  });

  it('refuses a name which is reserved in HTML', () => {
    assert.throws(() => createElementNames('font', 'face').custom('src'), /reserved name/);
  });
});
