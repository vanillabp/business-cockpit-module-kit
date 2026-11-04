import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIONS,
  BcRequestError,
  DEFAULT_TIMEOUT_MS,
  ERROR_CODES,
  MESSAGE_EVENT,
  REQUEST_EVENT,
  RESPONSE_EVENT,
  openDialog,
  receiveMessage,
  rejectOpenRequests,
  requestFromCockpit,
  toBcUserTask,
  toBcWorkflow,
} from '../src/index.js';

/**
 * An element whose cockpit answers every request with `answer(detail)`. An answer of undefined
 * means no answer at all.
 */
function elementWithCockpit(answer) {
  const element = new EventTarget();
  const requests = [];
  element.addEventListener(REQUEST_EVENT, (event) => {
    requests.push(event);
    const body = answer(event.detail);
    if (body) element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId: event.detail.requestId, ...body } }));
  });
  return { element, requests };
}

describe('the event protocol', () => {
  it('has the event names, the actions and the error codes of the description', () => {
    assert.deepEqual([REQUEST_EVENT, RESPONSE_EVENT, MESSAGE_EVENT], ['bc-request', 'bc-response', 'bc-message']);
    assert.equal(Object.keys(ACTIONS).length, 14);
    assert.deepEqual(Object.values(ERROR_CODES), ['UNKNOWN_ACTION', 'REFUSED', 'FAILED', 'NO_TARGET', 'TIMEOUT', 'DISCONNECTED']);
    assert.equal(DEFAULT_TIMEOUT_MS, 30_000);
  });

  it('dispatches a request that neither bubbles nor leaves the shadow tree, and resolves with the result', async () => {
    const { element, requests } = elementWithCockpit(() => ({ ok: true, result: 42 }));
    assert.equal(await requestFromCockpit(element, 'userTask.claim', { userTaskId: '4711' }), 42);
    const [event] = requests;
    assert.equal(event.bubbles, false);
    assert.equal(event.composed, false);
    assert.equal(event.detail.action, 'userTask.claim');
    assert.deepEqual(event.detail.args, { userTaskId: '4711' });
    assert.match(event.detail.requestId, /^[0-9a-f-]{36}$/);
  });

  it('ignores answers to other requests', async () => {
    const element = new EventTarget();
    element.addEventListener(REQUEST_EVENT, (event) => {
      element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId: 'other', ok: true, result: 'wrong' } }));
      element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId: event.detail.requestId, ok: true, result: 'right' } }));
    });
    assert.equal(await requestFromCockpit(element, 'x'), 'right');
  });

  it('rejects with the code and the status of the answer', async () => {
    const { element } = elementWithCockpit(() => ({ ok: false, error: { code: 'REFUSED', status: 409, message: 'taken' } }));
    const error = await requestFromCockpit(element, 'userTask.claim').catch((e) => e);
    assert.ok(error instanceof BcRequestError);
    assert.equal(error.code, 'REFUSED');
    assert.equal(error.status, 409);
    assert.equal(error.message, 'taken');
  });

  it('rejects with TIMEOUT after 30 seconds and ignores a later answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { element } = elementWithCockpit(() => undefined);
    const promise = requestFromCockpit(element, 'userTask.claim');
    t.mock.timers.tick(DEFAULT_TIMEOUT_MS - 1);
    let settled = false;
    promise.catch(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    await assert.rejects(promise, { code: 'TIMEOUT' });
  });

  it('waits for ever for cockpit.openDialog', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let request;
    const { element } = elementWithCockpit((detail) => { request = detail; return undefined; });
    const promise = openDialog(element, { element: 'taxi-ride-start', entry: 'HeaderElements' }, { a: 1 });
    t.mock.timers.tick(10 * DEFAULT_TIMEOUT_MS);
    element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId: request.requestId, ok: true, result: 'done' } }));
    assert.equal(await promise, 'done');
    assert.deepEqual(request.args, { element: 'taxi-ride-start', entry: 'HeaderElements', data: { a: 1 } });
  });

  it('rejects every open request with DISCONNECTED when the element leaves the page', async () => {
    const { element } = elementWithCockpit(() => undefined);
    const first = requestFromCockpit(element, 'a');
    const second = requestFromCockpit(element, 'b', {}, 0);
    rejectOpenRequests(element);
    await assert.rejects(first, { code: 'DISCONNECTED' });
    await assert.rejects(second, { code: 'DISCONNECTED' });
    rejectOpenRequests(element);
  });

  it('falls back to its own correlation id outside a secure context', async () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const { element, requests } = elementWithCockpit(() => ({ ok: true }));
      await requestFromCockpit(element, 'a');
      await requestFromCockpit(element, 'a');
      assert.notEqual(requests[0].detail.requestId, requests[1].detail.requestId);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('messages between areas', () => {
  it('subscribes, delivers messages of its subscription only, and unsubscribes', async () => {
    const { element, requests } = elementWithCockpit((detail) => (detail.action === 'page.subscribe' ? { ok: true, result: { subscriptionId: 's1' } } : { ok: true }));
    const received = [];
    const subscription = receiveMessage(element, (message, from) => received.push([message, from]));
    await subscription.ready;
    element.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: { subscriptionId: 's1', from: 'body', message: { valid: true } } }));
    element.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: { subscriptionId: 's2', from: 'body', message: 'not mine' } }));
    await subscription.unsubscribe();
    element.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: { subscriptionId: 's1', from: 'body', message: 'too late' } }));
    assert.deepEqual(received, [[{ valid: true }, 'body']]);
    assert.deepEqual(requests.map((r) => r.detail.action), ['page.subscribe', 'page.unsubscribe']);
    assert.deepEqual(requests[1].detail.args, { subscriptionId: 's1' });
  });

  it('keeps a message that comes before the answer to the subscription', async () => {
    const element = new EventTarget();
    element.addEventListener(REQUEST_EVENT, (event) => {
      // The cockpit delivers a kept message in the same task as its answer.
      element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId: event.detail.requestId, ok: true, result: { subscriptionId: 's1' } } }));
      element.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: { subscriptionId: 's1', from: 'body', message: 'early' } }));
    });
    const received = [];
    const subscription = receiveMessage(element, (message) => received.push(message));
    await subscription.ready;
    assert.deepEqual(received, ['early']);
  });
});

describe('BcUserTask and BcWorkflow', () => {
  it('turn every function into its action with the id of the user task', async () => {
    const { element, requests } = elementWithCockpit(() => ({ ok: true }));
    const userTask = toBcUserTask(element, { id: '4711', title: 'Confirm ride' });
    assert.equal(userTask.title, 'Confirm ride');
    await userTask.open();
    await userTask.navigateToWorkflow();
    await userTask.claim();
    await userTask.unclaim();
    await userTask.assign('anna');
    await userTask.unassign('anna');
    await userTask.sendTo('actions', 1);
    assert.deepEqual(requests.map((r) => [r.detail.action, r.detail.args]), [
      ['userTask.open', { userTaskId: '4711' }],
      ['userTask.navigateToWorkflow', { userTaskId: '4711' }],
      ['userTask.claim', { userTaskId: '4711' }],
      ['userTask.unclaim', { userTaskId: '4711' }],
      ['userTask.assign', { userTaskId: '4711', userId: 'anna' }],
      ['userTask.unassign', { userTaskId: '4711', userId: 'anna' }],
      ['page.sendTo', { target: 'actions', message: 1 }],
    ]);
  });

  it('return the user tasks of a case as BcUserTask again', async () => {
    const { element, requests } = elementWithCockpit((detail) => (detail.action === 'workflow.getUserTasks' ? { ok: true, result: [{ id: 't1' }] } : { ok: true }));
    const workflow = toBcWorkflow(element, { id: 'w1' });
    const [userTask] = await workflow.getUserTasks(true, false);
    await userTask.claim();
    await workflow.navigateToWorkflow();
    assert.deepEqual(requests.map((r) => [r.detail.action, r.detail.args]), [
      ['workflow.getUserTasks', { workflowId: 'w1', activeOnly: true, limitListAccordingToCurrentUsersPermissions: false }],
      ['userTask.claim', { userTaskId: 't1' }],
      ['workflow.navigateToWorkflow', { workflowId: 'w1' }],
    ]);
  });
});
