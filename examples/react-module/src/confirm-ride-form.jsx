// Visual entry ConfirmRideForm, written in React. Evaluating it defines four web components: the
// whole form for the area 'all', the same form split into the areas 'body' and 'actions', and a
// dialog. Each one renders into its own shadow root.

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

/** The fields of the form. It reports whether the comment is valid. */
function Fields({ userTask, onValid }) {
  const [comment, setComment] = useState('');
  const onInput = (event) => {
    setComment(event.target.value);
    onValid(event.target.value.length > 0);
  };
  return (
    <>
      <p data-test="framework">React</p>
      <p data-test="title">{userTask.title}</p>
      <input data-test="comment" value={comment} onInput={onInput} onChange={() => {}} />
    </>
  );
}

/** The buttons of the form. */
function Buttons({ userTask, openDialog, showNotification, valid }) {
  const [state, setState] = useState('');
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
      <button data-test="claim" onClick={claim}>Claim</button>
      <button data-test="complete" disabled={!valid}>Complete</button>
      <button data-test="dialog" onClick={dialog}>Dialog</button>
      <p data-test="state">{state}</p>
    </>
  );
}

/** The area 'all': fields and buttons in one web component. */
function All(props) {
  const [valid, setValid] = useState(false);
  return (
    <>
      <style>{STYLE}</style>
      <Fields {...props} onValid={setValid} />
      <Buttons {...props} valid={valid} />
    </>
  );
}

/** The area 'body': the fields. It tells the area 'actions' whether the comment is valid. */
function Body(props) {
  return (
    <>
      <style>{STYLE}</style>
      <Fields {...props} onValid={(valid) => props.userTask.sendTo('actions', { valid })} />
    </>
  );
}

/** The area 'actions': the buttons. */
function Actions(props) {
  const [valid, setValid] = useState(false);
  useEffect(() => {
    const subscription = props.userTask.receiveMessage((message) => setValid(Boolean(message?.valid)));
    return () => { subscription.unsubscribe(); };
  }, []);
  return (
    <>
      <style>{STYLE}</style>
      <Buttons {...props} valid={valid} />
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

reactElement('react-module-confirm-ride', All);
reactElement('react-module-confirm-ride-body', Body);
reactElement('react-module-confirm-ride-actions', Actions);
reactElement('react-module-confirm-ride-dialog', Dialog);
