import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { VixProcessManager } from '../src/vix-process.mjs';

const vixBin = resolve('runtime/vix-v0.6.0/vix');

test('a live Goal can be rebound by stable resume_id and is durably indexed', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'nova-vix-goal-project-'));
  const stateDir = await mkdtemp(join(tmpdir(), 'nova-vix-goal-state-'));
  const manager = new VixProcessManager({ vixBin, baseEnv: { ...process.env, HOME: cwd, NOVA_VIX_STATE_DIR: stateDir } });
  t.after(async () => { await manager.close(); await rm(cwd, { recursive: true, force: true }); await rm(stateDir, { recursive: true, force: true }); });

  const opened = await manager.open({ cwd, prompt: 'Reply with exactly GOAL_RECOVERY_OK and do not use tools.' });
  assert.equal(opened.modelCalls, 0);
  const rebound = await manager.open({ resume_id: opened.resume_id });
  assert.deepEqual(rebound, opened);
  const manifest = JSON.parse(await readFile(join(stateDir, opened.resume_id, 'manifest.json'), 'utf8'));
  assert.equal(manifest.goal_id, opened.resume_id);
  assert.equal(manifest.modelCalls, 0);
  assert.equal(manifest.configDir.startsWith(stateDir), true);
});
