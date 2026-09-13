import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VixProcessManager, inspectVixBinary, validateVixExecutable } from './vix-process.mjs';

export { validateVixExecutable } from './vix-process.mjs';
export const DEFAULT_VIX_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'vix-v0.6.0', 'vix');

export function createRuntimeStub() {
  return {
    async health() { return { ok: true, service: 'nova-vix-chatgpt', version: '0.1.0', transport: 'streamable-http', modelCalls: 0, stockVixVersion: 'test-stock', activeConnections: 0, vixOwner: 'connector-local-stock-cli', inferenceOwner: 'chatgpt-only-via-loopback' }; },
    async open() { return { connection_id: '123e4567-e89b-42d3-a456-426614174000', vix_version: 'test-stock', modelCalls: 0 }; },
    async exchange({ connection_id }) { return { connection_id, events: [], inference_requests: [], closed: false, exit_code: null, mission_control_url: null, modelCalls: 0, error: null }; },
    async inferenceContext() { throw new Error('No pending Vix inference request in MCP metadata test mode'); },
    async closeConnection(connection_id) { return { status: 'not_found', connection_id }; },
    async close() {}
  };
}

export async function createConnectorRuntime({ vixBin = process.env.NOVA_VIX_BIN || process.env.VIX_BIN || DEFAULT_VIX_BIN, baseEnv = process.env } = {}) {
  const selected = await validateVixExecutable(vixBin);
  const manager = new VixProcessManager({ vixBin: selected, baseEnv });
  return {
    async health() {
      try {
        const stock = await inspectVixBinary(selected);
        return { ok: true, service: 'nova-vix-chatgpt', version: '0.1.0', transport: 'streamable-http', modelCalls: 0, stockVixVersion: stock.vixVersion, activeConnections: manager.activeCount, vixOwner: 'connector-local-stock-cli', inferenceOwner: 'chatgpt-only-via-loopback' };
      } catch (error) {
        return { ok: false, service: 'nova-vix-chatgpt', version: '0.1.0', transport: 'streamable-http', modelCalls: 0, stockVixVersion: null, activeConnections: manager.activeCount, vixOwner: 'connector-local-stock-cli', inferenceOwner: 'chatgpt-only-via-loopback', error: error?.message || String(error) };
      }
    },
    async open(args) { return manager.open(args); },
    async exchange(args) { return manager.exchange(args); },
    async inferenceContext(args) { return manager.inferenceContext(args); },
    async closeConnection(id) { return manager.closeConnection(id); },
    async close() { await manager.close(); },
    manager
  };
}
