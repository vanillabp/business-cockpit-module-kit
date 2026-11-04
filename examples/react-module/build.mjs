import { buildModule } from '../build-module.mjs';

await buildModule(import.meta.dirname, {
  UserTaskList: 'src/data/user-task-list.js',
  UserTaskForm: 'src/data/user-task-form.js',
  ConfirmRideForm: 'src/confirm-ride-form.jsx',
});
