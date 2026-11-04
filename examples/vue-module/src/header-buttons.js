// Visual entry HeaderButtons, written in Vue: a button for the header of a cockpit which has one.

import { createApp, h, shallowReactive } from 'vue';
import { defineBcElement } from '@vanillabp/bc-module-kit';

const apps = new WeakMap();

defineBcElement('vue-module-new-ride', {
  mount: (root, props) => {
    const state = shallowReactive({ props });
    const container = document.createElement('div');
    root.append(container);
    const app = createApp({ setup: () => () => h('button', { 'data-test': 'new-ride' }, `New ride for ${state.props.currentUser?.id}`) });
    app.mount(container);
    apps.set(root, { app, state });
  },
  update: (root, props) => { apps.get(root).state.props = props; },
  unmount: (root) => apps.get(root).app.unmount(),
});
