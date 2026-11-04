// Visual entry ConfirmRideForm, written in React. Evaluating it defines the web components of
// the areas 'body' and 'actions' and of a dialog. Each one renders into its own shadow root.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defineBcElement } from '@vanillabp/bc-module-kit';

const STYLE = 'p, button { color: rgb(200, 0, 0); font-family: monospace; }';
const roots = new WeakMap();

function reactElement(name, Component) {
  defineBcElement(name, {
    mount: (root, props) => {
      const reactRoot = createRoot(root);
      roots.set(root, reactRoot);
      reactRoot.render(<Component {...props} />);
    },
    update: (root, props) => roots.get(root).render(<Component {...props} />),
    unmount: (root) => roots.get(root).unmount(),
  });
}

function Body({ userTask }) {
  const [comment, setComment] = useState('');
  const onInput = (event) => {
    setComment(event.target.value);
    userTask.sendTo('actions', { valid: event.target.value.length > 0 });
  };
  return (
    <>
      <style>{STYLE}</style>
      <p data-test="framework">React</p>
      <p data-test="title">{userTask.title}</p>
      <input data-test="comment" value={comment} onInput={onInput} onChange={() => {}} />
    </>
  );
}

function Actions({ userTask, openDialog, showNotification }) {
  const [valid, setValid] = useState(false);
  const [state, setState] = useState('');
  useEffect(() => {
    const subscription = userTask.receiveMessage((message) => setValid(Boolean(message?.valid)));
    return () => { subscription.unsubscribe(); };
  }, []);
  const claim = async () => {
    try {
      await userTask.claim();
      setState('claimed');
      await showNotification({ level: 'success', text: 'Claimed' });
    } catch (error) {
      setState(`failed: ${error.code}`);
    }
  };
  const dialog = async () => setState(`dialog: ${await openDialog({ element: 'react-module-confirm-ride-dialog', entry: 'ConfirmRideForm' }, { from: 'actions' })}`);
  return (
    <>
      <style>{STYLE}</style>
      <button data-test="claim" onClick={claim}>Claim</button>
      <button data-test="complete" disabled={!valid}>Complete</button>
      <button data-test="dialog" onClick={dialog}>Dialog</button>
      <p data-test="state">{state}</p>
    </>
  );
}

function Dialog({ data, closeDialog }) {
  return (
    <>
      <p data-test="dialog-data">{data?.from}</p>
      <button data-test="close" onClick={() => closeDialog('closed by React')}>Close</button>
    </>
  );
}

reactElement('react-module-confirm-ride-body', Body);
reactElement('react-module-confirm-ride-actions', Actions);
reactElement('react-module-confirm-ride-dialog', Dialog);
