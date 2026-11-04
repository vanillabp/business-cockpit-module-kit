// Visual entry HeaderButtons, written in React: a button for the header of a cockpit which has one.

import { createRoot } from 'react-dom/client';
import { defineBcElement } from '@vanillabp/bc-module-kit';

const roots = new WeakMap();

function NewRide({ currentUser }) {
  return <button data-test="new-ride">New ride for {currentUser?.id}</button>;
}

defineBcElement('react-module-new-ride', {
  mount: (root, props) => {
    roots.set(root, createRoot(root));
    roots.get(root).render(<NewRide {...props} />);
  },
  update: (root, props) => roots.get(root).render(<NewRide {...props} />),
  unmount: (root) => roots.get(root).unmount(),
});
