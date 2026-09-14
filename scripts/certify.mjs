import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_VIX_BIN } from '../src/runtime.mjs';
import { STOCK_PROVIDER_IDS, STRIPPED_PROVIDER_ENV, buildLaunchSpec, buildProviderOverlay, inspectVixBinary, isolatedEnv } from '../src/vix-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['src/gateway-bridge.mjs','src/vix-process.mjs','src/runtime.mjs','src/server.mjs','src/tools.mjs','test/runtime-e2e.test.mjs','test/goal-recovery.test.mjs','test/incremental-exchange.test.mjs','test/portable-install.test.mjs','scripts/certify.mjs']) {
  execFileSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'pipe' });
}

const stock = await inspectVixBinary(DEFAULT_VIX_BIN);
assert.match(stock.vixVersion, /0\.6\.0/);

const loopback = 'http://127.0.0.1:43210';
const overlay = buildProviderOverlay(loopback);
assert.equal(overlay.schema_version, 1);
assert.deepEqual(overlay.providers.map(provider => provider.id), STOCK_PROVIDER_IDS);
for (const provider of overlay.providers) {
  assert.equal(provider.local, true);
  assert.equal(provider.inference.base_url, `${loopback}/v1`);
  assert.deepEqual(provider.credential_methods, [{ kind: 'none' }]);
  assert.equal(Object.hasOwn(provider, 'models'), false);
}

const hostileEnv = { HOME: '/Users/example' };
for (const key of STRIPPED_PROVIDER_ENV) hostileEnv[key] = 'REAL_SECRET_SHOULD_NOT_SURVIVE';
const env = isolatedEnv(hostileEnv, { baseUrl: loopback }, 43211);
for (const key of STRIPPED_PROVIDER_ENV) {
  if (key === 'ANTHROPIC_API_KEY') assert.equal(env[key], 'nova-chatgpt-loopback-only');
  else if (key === 'ANTHROPIC_BASE_URL') assert.equal(env[key], loopback);
  else assert.equal(env[key], undefined, `${key} must be stripped`);
}
assert.equal(env.HOME, '/Users/example');
assert.equal(env.AWS_EC2_METADATA_DISABLED, 'true');
assert.equal(env.VIX_TELEMETRY, 'off');
assert.equal(env.NOVA_VIX_GATEWAY, loopback);
assert.equal(env.VIX_WEB_PORT, '43211');

const darwinLaunch = buildLaunchSpec('/tmp/vix', ['-version'], 'darwin');
assert.equal(darwinLaunch.command, '/usr/bin/sandbox-exec');
assert.equal(darwinLaunch.platformIsolation, 'macos-sandbox-exec');
assert.equal(darwinLaunch.keychainAccessBlocked, true);

const linuxLaunch = buildLaunchSpec('/tmp/vix', ['-version'], 'linux');
assert.equal(linuxLaunch.command, '/tmp/vix');
assert.deepEqual(linuxLaunch.args, ['-version']);
assert.equal(linuxLaunch.platformIsolation, 'linux-env-overlay');
assert.equal(linuxLaunch.keychainAccessBlocked, null);

console.log(JSON.stringify({ ok: true, stockVixVersion: stock.vixVersion, providerIds: STOCK_PROVIDER_IDS, modelCalls: 0 }));
