// A small cockpit made of the reference host, to run the conformance test against. It shows the
// page of one user task: ?module=react-module picks the module, ?areas=body,actions gives it areas.

import { BcRefusedError, createModuleHost } from '@vanillabp/bc-module-host';

const query = new URLSearchParams(location.search);
const areas = query.get('areas')?.split(',').filter(Boolean) ?? [];
const page = document.getElementById('page');
for (const area of areas) {
  const slot = document.createElement('div');
  slot.dataset.bcArea = area;
  page.append(slot);
}

const host = createModuleHost({
  modules: [{ id: 'react-module', uri: '/wm/react-module' }, { id: 'vue-module', uri: '/wm/vue-module' }],
  areas,
  properties: { language: 'en', currentUser: { id: 'anna' } },
  actions: {
    'userTask.claim': () => { if (query.has('refuse')) throw new BcRefusedError(409, 'somebody else has it'); },
    'cockpit.showNotification': () => {},
  },
});

host.showUserTask(query.get('module'), { id: '4711', title: 'Confirm ride 4711', bpmnProcessId: 'TaxiRide', taskDefinition: 'confirmRide' }, page);
