import assert from 'node:assert/strict';
import test from 'node:test';
import { blockUnsafeNetwork } from './recovery-demo.mjs';

test('blocks and records the API stream WebSocket without routing Vite HMR', async () => {
  const handlers = new Map();
  const page = {
    async route() {},
    async routeWebSocket(pattern, handler) { handlers.set(pattern, handler); },
  };

  const violations = await blockUnsafeNetwork(page);
  assert.equal(handlers.has('**/api/stream'), true, 'the API stream WebSocket is intercepted');
  assert.equal(handlers.has('**/'), false, 'the Vite HMR WebSocket remains available');

  let closed = false;
  await handlers.get('**/api/stream')({ close: async () => { closed = true; } });
  assert.equal(closed, true, 'the API stream WebSocket is closed before it can connect');
  assert.deepEqual(violations, ['WebSocket /api/stream']);
});
