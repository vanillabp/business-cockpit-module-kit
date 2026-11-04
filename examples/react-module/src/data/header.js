// Data entry Header: an entry of the module's own, beyond the four of the kit. Only a cockpit
// with a header asks it. Any other cockpit ignores it, and the rest of the module works.

export const header = (currentUser) => {
  if (!currentUser?.id) return undefined;
  return [{ entry: 'HeaderButtons', element: 'react-module-new-ride' }];
};
