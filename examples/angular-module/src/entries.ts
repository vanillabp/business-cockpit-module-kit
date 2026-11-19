// The entry point of the Angular CLI build, see angular.json. The cockpit never loads this file.
// Each import() below makes the Angular CLI write the entry as an ES module of its own, with the
// hash of its content in the file name, the way it writes a lazy loaded route. Angular itself goes
// into a chunk which the visual entries share. The data entries never import it.
//
// A new entry needs a line here and a line in scripts/write-manifest.mjs.

export const entries = {
  UserTaskList: () => import('./data/user-task-list.js'),
  UserTaskForm: () => import('./data/user-task-form.js'),
  Header: () => import('./data/header.js'),
  ConfirmRideForm: () => import('./confirm-ride-form'),
  HeaderButtons: () => import('./header-buttons'),
};
