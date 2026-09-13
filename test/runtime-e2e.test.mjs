import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCK_PROVIDER_IDS, VixProcessManager } from '../src/vix-process.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vixBin = resolve(repoRoot, 'runtime', 'vix-v0.6.0', 'vix');

test('stock Vix 0.6.0 uses exactly one ChatGPT loopback inference end to end', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'nova-vix-e2e-project-'));
  const baseEnv = { ...process.env, HOME: process.env.HOME || '/Users/example' };
  const manager = new VixProcessManager({ vixBin, baseEnv });
  t.after(async () => { await manager.close(); await rm(cwd, { recursive: true, force: true }); });

  const opened = await manager.open({ cwd, prompt: 'Reply with exactly VIX_CHATGPT_OK and do not use tools.' });
  assert.equal(opened.modelCalls, 0);
  assert.match(opened.vix_version, /0\.6\.0/);

  let pending = null;
  for (let i = 0; i < 80 && !pending; i += 1) {
    const state = await manager.exchange({ connection_id: opened.connection_id, wait_ms: 250 });
    assert.doesNotMatch(state.error || '', /auth\.json|storing credentials in plaintext/i);
    if (state.closed && state.error) assert.fail(state.error);
    assert.ok(state.inference_requests.length <= 1, 'Vix emitted multiple inference requests before first reply');
    pending = state.inference_requests[0] ?? null;
  }
  assert.ok(pending, 'stock Vix must request inference through the loopback gateway');

  const replyText = process.env.NOVA_VIX_E2E_RESPONSE;
  assert.equal(replyText, 'VIX_CHATGPT_OK', 'ChatGPT-authored E2E response must be supplied explicitly');
  const reply = { id: 'resp_chatgpt_e2e', model: 'chatgpt-runtime', content: [{ type: 'text', text: replyText }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  const events = [];
  let answered = false;
  let closed = false;
  for (let i = 0; i < 80; i += 1) {
    const state = await manager.exchange({ connection_id: opened.connection_id, inference_responses: answered ? [] : [{ request_id: pending.request_id, response: reply }], wait_ms: 250 });
    answered = true;
    events.push(...state.events);
    assert.equal(state.inference_requests.length, 0, 'Vix requested more than one inference for the E2E prompt');
    if (state.closed) {
      assert.equal(state.exit_code, 0, state.error || JSON.stringify(events));
      closed = true;
      break;
    }
  }
  assert.equal(closed, true, 'Vix turn did not finish');
  assert.match(JSON.stringify(events), /VIX_CHATGPT_OK/);
  assert.equal(manager.modelCalls, 0);
  assert.equal(manager.lastLaunchAudit?.realProviderEnvInherited, false);
  assert.equal(manager.lastLaunchAudit?.realProviderCredentialsInjected, false);
  assert.equal(manager.lastLaunchAudit?.syntheticPreflightCredential, true);
  assert.equal(manager.lastLaunchAudit?.gatewayTls, false);
  assert.equal(manager.lastLaunchAudit?.keychainAccessBlocked, true);
  assert.equal(manager.lastLaunchAudit?.homePreserved, true);
  assert.equal(manager.lastLaunchAudit?.configDirOverrideUsed, true);
  assert.deepEqual(manager.lastLaunchAudit?.providerOverlayIds, STOCK_PROVIDER_IDS);
  assert.match(manager.lastLaunchAudit?.gatewayBaseUrl || '', /^http:\/\/127\.0\.0\.1:/);
});

test('stock Vix continues to a second ChatGPT checkpoint after a tool result', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'nova-vix-e2e-tool-project-'));
  const marker = join(cwd, 'marker.txt');
  await writeFile(marker, 'VIX_TOOL_MARKER\n');
  const baseEnv = { ...process.env, HOME: process.env.HOME || '/Users/example' };
  const manager = new VixProcessManager({ vixBin, baseEnv });
  t.after(async () => { await manager.close(); await rm(cwd, { recursive: true, force: true }); });

  const opened = await manager.open({ cwd, prompt: 'Read marker.txt, then reply with exactly VIX_TOOL_CONTINUITY_OK.' });
  assert.equal(opened.modelCalls, 0);

  let first = null;
  for (let i = 0; i < 80 && !first; i += 1) {
    const state = await manager.exchange({ connection_id: opened.connection_id, wait_ms: 250 });
    assert.doesNotMatch(state.error || '', /auth\.json|storing credentials in plaintext/i);
    if (state.closed && state.error) assert.fail(state.error);
    first = state.inference_requests[0] ?? null;
  }
  assert.ok(first, 'stock Vix must emit the first ChatGPT checkpoint');

  const toolReply = {
    id: 'resp_chatgpt_tool_e2e',
    model: 'chatgpt-runtime',
    content: [{ type: 'tool_use', id: 'toolu_vix_continuity', name: 'read_file', input: { path: marker, reason: 'Read the deterministic marker required by the E2E continuity check.' } }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1, output_tokens: 1 }
  };
  const events = [];
  let second = null;
  let answeredFirst = false;
  for (let i = 0; i < 120 && !second; i += 1) {
    const state = await manager.exchange({ connection_id: opened.connection_id, inference_responses: answeredFirst ? [] : [{ request_id: first.request_id, response: toolReply }], wait_ms: 250 });
    answeredFirst = true;
    events.push(...state.events);
    assert.doesNotMatch(state.error || '', /auth\.json|storing credentials in plaintext/i);
    if (state.closed) assert.fail(state.error || 'Vix closed before emitting a post-tool checkpoint');
    second = state.inference_requests[0] ?? null;
  }
  assert.ok(second, `Vix did not continue after tool result: ${JSON.stringify(events)}`);
  assert.match(JSON.stringify(second.request), /VIX_TOOL_MARKER/);

  const finalReply = { id: 'resp_chatgpt_tool_final', model: 'chatgpt-runtime', content: [{ type: 'text', text: 'VIX_TOOL_CONTINUITY_OK' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  let answeredSecond = false;
  let closed = false;
  for (let i = 0; i < 80; i += 1) {
    const state = await manager.exchange({ connection_id: opened.connection_id, inference_responses: answeredSecond ? [] : [{ request_id: second.request_id, response: finalReply }], wait_ms: 250 });
    answeredSecond = true;
    events.push(...state.events);
    assert.equal(state.inference_requests.length, 0, 'unexpected third inference checkpoint');
    if (state.closed) {
      assert.equal(state.exit_code, 0, state.error || JSON.stringify(events));
      closed = true;
      break;
    }
  }
  assert.equal(closed, true, 'Vix post-tool turn did not finish');
  assert.match(JSON.stringify(events), /VIX_TOOL_CONTINUITY_OK/);
  assert.equal(manager.modelCalls, 0);
});
