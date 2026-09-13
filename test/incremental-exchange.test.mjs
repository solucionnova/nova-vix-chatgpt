import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { GatewayBridge } from '../src/gateway-bridge.mjs';

test('exchange queue is incremental while a pending checkpoint remains replayable', async t => {
  const bridge = new GatewayBridge({ requestTimeoutMs: 5000 });
  await bridge.start();
  t.after(() => bridge.close());
  const body = JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'checkpoint' }] });
  const response = request(`${bridge.baseUrl}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } });
  response.end(body);
  const first = await bridge.waitForRequest({ timeoutMs: 1000 });
  assert.equal(bridge.drainRequests().length, 0);
  assert.equal(bridge.pendingRequests()[0].request_id, first.request_id);
  await bridge.respond(first.request_id, { content: [{ type: 'text', text: 'done' }] });
  assert.deepEqual(bridge.pendingRequests(), []);
  await assert.rejects(() => bridge.respond(first.request_id, { content: [{ type: 'text', text: 'duplicate' }] }), /already accepted/);
});
