// The names of the web components of this module. The data entries and the visual entries import
// them from here, so both sides use the same names. Plain JavaScript without a framework, because a
// data entry must not carry one.
//
// Every name starts with the prefix of the module id and the id of this build, for example
// `react-module-mvaro4w0-taxi-ride--confirm-ride--form`. The prefix keeps the names apart from those
// of other modules. The build id keeps them apart from those of an earlier build of this module, so
// a new build loads without a reload of the page. src/bc-build.js is written for every build, see
// examples/write-bc-build.mjs.

import { createElementNames } from '@vanillabp/bc-module-kit';
import { BUILD_ID, WORKFLOW_MODULE_ID } from './bc-build.js';

const names = createElementNames(WORKFLOW_MODULE_ID, BUILD_ID);

/** The web components of the form of the user task confirmRide, one per area, and its dialog. */
export const CONFIRM_RIDE = Object.freeze({
  all: names.userTask('TaxiRide', 'confirmRide', 'form'),
  body: names.userTask('TaxiRide', 'confirmRide', 'body'),
  actions: names.userTask('TaxiRide', 'confirmRide', 'actions'),
  dialog: names.userTask('TaxiRide', 'confirmRide', 'dialog'),
});

/** The button of the module in the header of a cockpit which has one. */
export const NEW_RIDE = names.custom('new-ride');
