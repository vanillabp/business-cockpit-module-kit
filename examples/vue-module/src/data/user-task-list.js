// Data entry UserTaskList: plain JavaScript, it imports no framework.

export const userTaskListColumns = (userTask) => {
  if (userTask.bpmnProcessId !== 'TaxiRide') return undefined;
  return [
    {
      title: { en: 'Customer', de: 'Kundin' },
      path: 'details.customer',
      priority: 10,
      width: '12rem',
      show: true,
      sortable: true,
      filterable: true,
      resizeable: true,
    },
  ];
};
