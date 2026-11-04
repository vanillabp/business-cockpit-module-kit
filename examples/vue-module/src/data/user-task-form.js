// Data entry UserTaskForm: it names the visual entry and its web components as strings and
// imports no form, so loading it loads no framework.

export const userTaskForm = (userTask) => {
  if (userTask.bpmnProcessId !== 'TaxiRide') return undefined;
  if (userTask.taskDefinition !== 'confirmRide') return undefined;
  return {
    entry: 'ConfirmRideForm',
    element: {
      body: 'vue-module-confirm-ride-body',
      actions: 'vue-module-confirm-ride-actions',
    },
  };
};
