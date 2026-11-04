// Data entry UserTaskForm: it names the visual entry and its web components as strings and
// imports no form, so loading it loads no framework.
//
// 'all' is the one web component every cockpit can show. 'body' and 'actions' are areas a
// cockpit may have on top. A cockpit with these areas shows them and ignores 'all'; a cockpit
// without them shows 'all'.

export const userTaskForm = (userTask) => {
  if (userTask.bpmnProcessId !== 'TaxiRide') return undefined;
  if (userTask.taskDefinition !== 'confirmRide') return undefined;
  return {
    entry: 'ConfirmRideForm',
    element: {
      all: 'vue-module-confirm-ride',
      body: 'vue-module-confirm-ride-body',
      actions: 'vue-module-confirm-ride-actions',
    },
  };
};
