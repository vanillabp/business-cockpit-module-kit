// Visual entry ConfirmRideForm, written in Vue with render functions, so it needs no compiler.
// Evaluating it defines the web components of the areas 'body' and 'actions' and of a dialog.
// Each one renders into its own shadow root.

import { createApp, h, onMounted, onUnmounted, ref, shallowReactive } from 'vue';
import { defineBcElement } from '@vanillabp/bc-module-kit';

const STYLE = 'p, button { color: rgb(200, 0, 0); font-family: monospace; }';
const apps = new WeakMap();

function vueElement(name, setup) {
  defineBcElement(name, {
    mount: (root, props) => {
      const state = shallowReactive({ props });
      const container = document.createElement('div');
      root.append(container);
      const app = createApp({ setup: () => setup(state) });
      app.mount(container);
      apps.set(root, { app, state });
    },
    update: (root, props) => {
      apps.get(root).state.props = props;
    },
    unmount: (root) => apps.get(root).app.unmount(),
  });
}

vueElement('vue-module-confirm-ride-body', (state) => {
  const comment = ref('');
  const onInput = (event) => {
    comment.value = event.target.value;
    state.props.userTask.sendTo('actions', { valid: comment.value.length > 0 });
  };
  return () => [
    h('style', STYLE),
    h('p', { 'data-test': 'framework' }, 'Vue'),
    h('p', { 'data-test': 'title' }, state.props.userTask.title),
    h('input', { 'data-test': 'comment', value: comment.value, onInput }),
  ];
});

vueElement('vue-module-confirm-ride-actions', (state) => {
  const valid = ref(false);
  const result = ref('');
  let subscription;
  onMounted(() => {
    subscription = state.props.userTask.receiveMessage((message) => { valid.value = Boolean(message?.valid); });
  });
  onUnmounted(() => subscription?.unsubscribe());
  const claim = async () => {
    try {
      await state.props.userTask.claim();
      result.value = 'claimed';
      await state.props.showNotification({ level: 'success', text: 'Claimed' });
    } catch (error) {
      result.value = `failed: ${error.code}`;
    }
  };
  const dialog = async () => {
    const closedWith = await state.props.openDialog({ element: 'vue-module-confirm-ride-dialog', entry: 'ConfirmRideForm' }, { from: 'actions' });
    result.value = `dialog: ${closedWith}`;
  };
  return () => [
    h('style', STYLE),
    h('button', { 'data-test': 'claim', onClick: claim }, 'Claim'),
    h('button', { 'data-test': 'complete', disabled: !valid.value }, 'Complete'),
    h('button', { 'data-test': 'dialog', onClick: dialog }, 'Dialog'),
    h('p', { 'data-test': 'state' }, result.value),
  ];
});

vueElement('vue-module-confirm-ride-dialog', (state) => () => [
  h('p', { 'data-test': 'dialog-data' }, state.props.data?.from),
  h('button', { 'data-test': 'close', onClick: () => state.props.closeDialog('closed by Vue') }, 'Close'),
]);
