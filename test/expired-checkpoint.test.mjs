import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayBridge } from '../src/gateway-bridge.mjs';

test('expired inference requests are not delivered after their HTTP request finishes', async t => {
  const bridge = new GatewayBridge({ requestTimeoutMs: 40 });
  await bridge.start(); t.after(() => bridge.close());
  const response = await fetch(`${bridge.baseUrl}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'expired', messages: [], max_tokens: 1, stream: true }) });
  assert.equal(response.status, 504);
  await response.text();
  assert.deepEqual(bridge.drainRequests(), []);
});
