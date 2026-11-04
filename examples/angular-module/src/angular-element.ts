// Turns a standalone Angular component into a web component of the cockpit. defineBcElement does
// the part every framework shares: the open shadow root, the properties and the event protocol.
// This file only puts the component into the shadow root and hands it the properties.

import { type ApplicationRef, type ComponentRef, type Type, createComponent, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { type BcElementProps, defineBcElement } from '@vanillabp/bc-module-kit';

// One Angular application for all web components of the module. It has no zone.js: signals and
// the template's own events tell Angular when to draw again.
let application: Promise<ApplicationRef> | undefined;
const startApplication = () => {
  application ??= createApplication({ providers: [provideZonelessChangeDetection()] });
  return application;
};

interface Part {
  props: BcElementProps;
  component?: ComponentRef<unknown>;
  removed: boolean;
}

/**
 * Defines the web component `name`, which shows `component`. The component has one input, `props`:
 * all properties and functions of the cockpit. `style` goes into the shadow root.
 * Angular would put the styles of a component into the head of the page, and from there they
 * do not reach into a shadow root.
 */
export function angularElement(name: string, component: Type<unknown>, style = ''): void {
  const parts = new WeakMap<ShadowRoot, Part>();
  defineBcElement(name, {
    mount: (root, props) => {
      const part: Part = { props, removed: false };
      parts.set(root, part);
      const styleElement = document.createElement('style');
      styleElement.textContent = style;
      const hostElement = document.createElement('div');
      root.append(styleElement, hostElement);
      // Starting the application takes a moment, but only for the first web component.
      startApplication().then((applicationRef) => {
        if (part.removed) return;
        part.component = createComponent(component, { environmentInjector: applicationRef.injector, hostElement });
        part.component.setInput('props', part.props);
        applicationRef.attachView(part.component.hostView);
        // Draws the component completely now, not only its elements, so no empty text shows.
        part.component.changeDetectorRef.detectChanges();
      });
    },
    update: (root, props) => {
      const part = parts.get(root)!;
      part.props = props;
      part.component?.setInput('props', props);
    },
    unmount: (root) => {
      const part = parts.get(root)!;
      part.removed = true;
      part.component?.destroy();
      root.replaceChildren();
    },
  });
}
