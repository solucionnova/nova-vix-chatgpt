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
  assert.match(source, /bootstrap_ok=0/);
  assert.match(source, /after 5 attempts/);

  const testHome = '/tmp/nova-vix-test-home';
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const output = execFileSync('/bin/bash', [serviceInstaller], {
    cwd: root,
    env: { ...process.env, HOME: testHome, NOVA_VIX_INSTALL_DRY_RUN: '1', NODE_BIN: process.execPath, PORT: '18814' },
    encoding: 'utf8'
  });
  assert.match(output, /label=com\.ramon\.nova-vix-chatgpt/);
  assert.match(output, /port=18816/);
  assert.match(output, new RegExp(`root=${testHome}/\\.nova/vix-chatgpt/releases/${sourceSha}`));
  assert.match(output, new RegExp(`source_sha=${sourceSha}`));
  assert.match(output, /plist_valid=true/);
  const pathLine = output.split('\n').find(line => line.startsWith('path='));
  assert.ok(pathLine, 'dry-run must expose the launchd PATH');
  const launchPath = pathLine.slice('path='.length).split(':');
  assert.ok(launchPath.indexOf(`${testHome}/.local/bin`) >= 0, 'launchd PATH must include the user-local gateway directory');
  assert.ok(launchPath.indexOf(`${testHome}/.local/bin`) < launchPath.indexOf('/opt/homebrew/bin'), 'user-local gateway directory must precede Homebrew');
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
