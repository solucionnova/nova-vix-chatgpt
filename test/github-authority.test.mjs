import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GithubAuthority } from '../src/github-authority.mjs';

test('GitHub mutation preflights one identity and never falls back', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nova-gh-authority-'));
  const marker = join(dir, 'mutated');
  const fakeGh = join(dir, 'gh');
  await writeFile(fakeGh, `#!/usr/bin/env node
const fs = await import('node:fs/promises');
if (process.argv[2] === 'auth') process.stdout.write(JSON.stringify({hosts:{'github.com':[{active:true,host:'github.com',login:'test',scopes:process.env.TEST_SCOPES||''}]}}));
else await fs.writeFile(${JSON.stringify(marker)}, 'changed');
`);
  await chmod(fakeGh, 0o755);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const authority = new GithubAuthority({ ghBin: fakeGh, env: { ...process.env, TEST_SCOPES: '' } });
  await assert.rejects(() => authority.issueLabel({ repo: 'solucionnova/nova-vix-chatgpt', issue_number: 3, label: 'x' }), /missing scope|unavailable/);
  await assert.rejects(() => readFile(marker));
});
