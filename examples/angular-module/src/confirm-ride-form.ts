// Visual entry ConfirmRideForm, written in Angular with standalone components and signals.
// Evaluating it defines four web components: the whole form for the area 'all', the same form
// split into the areas 'body' and 'actions', and a dialog. Each one renders into its own shadow
// root.

import { Component, type OnDestroy, type OnInit, input, output, signal } from '@angular/core';
import type { BcElementProps, BcSubscription, BcUserTask } from '@vanillabp/bc-module-kit';
import { angularElement } from './angular-element';

const STYLE = 'p, button { color: rgb(200, 0, 0); font-family: monospace; }';

/** The fields of the form. It reports whether the comment is valid. */
@Component({
  selector: 'confirm-ride-fields',
  template: `
    <p data-test="framework">Angular</p>
    <p data-test="title">{{ userTask().title }}</p>
    <input data-test="comment" [value]="comment()" (input)="onInput($event)" />
  `,
})
class Fields {
  readonly userTask = input.required<BcUserTask>();
  readonly valid = output<boolean>();
  readonly comment = signal('');

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.comment.set(value);
    this.valid.emit(value.length > 0);
  }
}

/** The buttons of the form. */
@Component({
  selector: 'confirm-ride-buttons',
  template: `
    <button data-test="claim" (click)="claim()">Claim</button>
    <button data-test="complete" [disabled]="!valid()">Complete</button>
    <button data-test="dialog" (click)="dialog()">Dialog</button>
    <p data-test="state">{{ state() }}</p>
  `,
})
class Buttons {
  readonly props = input.required<BcElementProps>();
  readonly valid = input(false);
  readonly state = signal('');

  async claim(): Promise<void> {
    try {
      await this.props().userTask!.claim();
      this.state.set('claimed');
      await this.props().showNotification({ level: 'success', text: 'Claimed' });
    } catch (error) {
      this.state.set(`failed: ${(error as { code?: string }).code}`);
    }
  }

  async dialog(): Promise<void> {
    const closedWith = await this.props().openDialog({ element: 'angular-module-confirm-ride-dialog', entry: 'ConfirmRideForm' }, { from: 'actions' });
    this.state.set(`dialog: ${closedWith}`);
  }
}

/** The area 'all': fields and buttons in one web component. */
@Component({
  imports: [Fields, Buttons],
  template: `
    <confirm-ride-fields [userTask]="props().userTask!" (valid)="valid.set($event)" />
    <confirm-ride-buttons [props]="props()" [valid]="valid()" />
  `,
})
class All {
  readonly props = input.required<BcElementProps>();
  readonly valid = signal(false);
}

/** The area 'body': the fields. It tells the area 'actions' whether the comment is valid. */
@Component({
  imports: [Fields],
  template: `<confirm-ride-fields [userTask]="props().userTask!" (valid)="props().userTask!.sendTo('actions', { valid: $event })" />`,
})
class Body {
  readonly props = input.required<BcElementProps>();
}

/** The area 'actions': the buttons. */
@Component({
  imports: [Buttons],
  template: `<confirm-ride-buttons [props]="props()" [valid]="valid()" />`,
})
class Actions implements OnInit, OnDestroy {
  readonly props = input.required<BcElementProps>();
  readonly valid = signal(false);
  private subscription?: BcSubscription;

  ngOnInit(): void {
    this.subscription = this.props().userTask!.receiveMessage((message) => this.valid.set(Boolean((message as { valid?: boolean })?.valid)));
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}

@Component({
  template: `
    <p data-test="dialog-data">{{ from() }}</p>
    <button data-test="close" (click)="props().closeDialog('closed by Angular')">Close</button>
  `,
})
class Dialog {
  readonly props = input.required<BcElementProps>();
  from(): string | undefined {
    return (this.props().data as { from?: string } | undefined)?.from;
  }
}

angularElement('angular-module-confirm-ride', All, STYLE);
angularElement('angular-module-confirm-ride-body', Body, STYLE);
angularElement('angular-module-confirm-ride-actions', Actions, STYLE);
angularElement('angular-module-confirm-ride-dialog', Dialog);
