// Visual entry HeaderButtons, written in Angular: a button for the header of a cockpit which has one.

import { Component, input } from '@angular/core';
import type { BcElementProps } from '@vanillabp/bc-module-kit';
import { angularElement } from './angular-element';

@Component({
  template: `<button data-test="new-ride">New ride for {{ props().currentUser?.['id'] }}</button>`,
})
class NewRide {
  readonly props = input.required<BcElementProps>();
}

angularElement('angular-module-new-ride', NewRide);
