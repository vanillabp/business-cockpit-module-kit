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

  it('createElementNames builds the name from the prefix, the build id and the short name', () => {
    const elementName = createElementNames('taxi-ride', 'mvaro4w0');
    assert.equal(elementName('assess-risk-form'), 'taxi-ride-mvaro4w0-assess-risk-form');
    assert.equal(elementName('confirm'), 'taxi-ride-mvaro4w0-confirm');
  });

  it('createElementNames turns the module id into its prefix first', () => {
    assert.equal(createElementNames('TaxiRide', 'mvaro4w0')('confirm'), 'taxi-ride-mvaro4w0-confirm');
    assert.equal(createElementNames('4711', 'mvaro4w0')('confirm'), 'wm-4711-mvaro4w0-confirm');
  });

  it('gives two builds of one module different names', () => {
    const before = createElementNames('taxi-ride', 'mvaro4w0');
    const after = createElementNames('taxi-ride', 'mvaro4w1');
    assert.notEqual(before('confirm'), after('confirm'));
  });

  it('gives two modules with the same prefix different names as long as their builds differ', () => {
    assert.notEqual(createElementNames('TaxiRide', 'a1')('confirm'), createElementNames('taxi-ride', 'a2')('confirm'));
  });

  it('accepts the build id of the skill, the time of the build in base 36', () => {
    const buildId = Date.parse('2026-10-16T09:30:00Z').toString(36);
    assert.equal(buildId, 'mvaro4w0');
    assert.equal(createElementNames('taxi-ride', buildId)('x'), 'taxi-ride-mvaro4w0-x');
  });

  it('gives a valid name of a custom element', () => {
    const name = createElementNames('Loan_Approval.2', 'mvaro4w0')('assess-risk-form');
    assert.match(name, /^[a-z][a-z0-9-]*-[a-z0-9-]*$/);
  });

  it('refuses a build id which is missing or has other characters than lower case letters and digits', () => {
    for (const buildId of [undefined, '', 'MVARO4W0', 'mvaro-4w0', 'mvaro4w0 ', 1760607000000]) {
      assert.throws(() => createElementNames('taxi-ride', buildId), TypeError, String(buildId));
    }
  });

  it('refuses a short name which is not lower case letters, digits and hyphens', () => {
    const elementName = createElementNames('taxi-ride', 'mvaro4w0');
    for (const shortName of [undefined, '', 'AssessRisk', 'assess_risk', 'assess risk', 'formulär']) {
      assert.throws(() => elementName(shortName), TypeError, String(shortName));
    }
  });

  it('refuses a name which is reserved in HTML', () => {
    assert.throws(() => createElementNames('font', 'face')('src'), /reserved name/);
  });
});
