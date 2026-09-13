import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLaunchSpec } from '../src/vix-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceInstaller = resolve(root, 'ops', 'install-launchd-macos.sh');
const vixInstaller = resolve(root, 'scripts', 'install-vix.sh');

test('macOS service installer is portable and dry-run is side-effect free', async () => {
  const source = await readFile(serviceInstaller, 'utf8');
  assert.doesNotMatch(source, /\/Users\/|blocked-/);
  assert.match(source, /NOVA_VIX_INSTALL_DRY_RUN/);
  assert.match(source, /127\.0\.0\.1/);

  const output = execFileSync('/bin/bash', [serviceInstaller], {
    cwd: root,
    env: { ...process.env, NOVA_VIX_INSTALL_DRY_RUN: '1', NODE_BIN: process.execPath, PORT: '18816' },
    encoding: 'utf8'
  });
  assert.match(output, /label=com\.nova\.vix-chatgpt/);
  assert.match(output, /port=18816/);
  assert.match(output, /plist_valid=true/);
});

test('Vix installer selects verified Darwin and Linux assets without downloading', () => {
  const darwin = execFileSync('/bin/bash', [vixInstaller], { cwd: root, env: { ...process.env, VIX_INSTALL_DRY_RUN: '1', VIX_INSTALL_OS: 'Darwin', VIX_INSTALL_ARCH: 'arm64' }, encoding: 'utf8' });
  assert.match(darwin, /asset=vix-darwin-arm64\.tar\.gz/);
  assert.match(darwin, /sha256=d93a4919d5d0fbea6f1f294a81cf5b588a75ef9ea16bf77247761765e506dd67/);

  const linux = execFileSync('/bin/bash', [vixInstaller], { cwd: root, env: { ...process.env, VIX_INSTALL_DRY_RUN: '1', VIX_INSTALL_OS: 'Linux', VIX_INSTALL_ARCH: 'x86_64' }, encoding: 'utf8' });
  assert.match(linux, /asset=vix-linux-amd64\.tar\.gz/);
  assert.match(linux, /sha256=169cb08785a6dcd6e39c27f865d024b9a30516000b900fd5632c73b6c9380108/);
});

test('runtime launcher preserves macOS sandbox and uses sanitized direct launch on Linux', () => {
  const darwin = buildLaunchSpec('/tmp/vix', ['-version'], 'darwin');
  assert.equal(darwin.command, '/usr/bin/sandbox-exec');
  assert.equal(darwin.platformIsolation, 'macos-sandbox-exec');
  assert.equal(darwin.keychainAccessBlocked, true);
  assert.ok(darwin.args.includes('/tmp/vix'));

  const linux = buildLaunchSpec('/tmp/vix', ['-version'], 'linux');
  assert.equal(linux.command, '/tmp/vix');
  assert.deepEqual(linux.args, ['-version']);
  assert.equal(linux.platformIsolation, 'linux-env-overlay');
  assert.equal(linux.keychainAccessBlocked, null);
});
