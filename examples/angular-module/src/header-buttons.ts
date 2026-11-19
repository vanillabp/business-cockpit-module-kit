// Visual entry HeaderButtons, written in Angular: a button for the header of a cockpit which has one.

import { Component, input } from '@angular/core';
import type { BcElementProps } from '@vanillabp/bc-module-kit';
import { angularElement } from './angular-element';
import { NEW_RIDE } from './element-names.js';

@Component({
  template: `<button data-test="new-ride">New ride for {{ props().currentUser?.['id'] }}</button>`,
})
class NewRide {
  readonly props = input.required<BcElementProps>();
}

angularElement(NEW_RIDE, NewRide);
