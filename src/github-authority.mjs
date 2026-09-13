import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function safeError(error) {
  return String(error?.stderr || error?.message || error).replace(/(ghp_|github_pat_)[A-Za-z0-9_]+/g, '[redacted]').slice(-2000);
}

export class GithubAuthority {
  constructor({ ghBin = process.env.GH_BIN || 'gh', env = process.env } = {}) {
    this.ghBin = ghBin;
    this.env = { ...env, GH_PROMPT_DISABLED: 'true' };
  }

  async #status() {
    try {
      const { stdout } = await execFileAsync(this.ghBin, ['auth', 'status', '--json', 'hosts'], { env: this.env, timeout: 10000, maxBuffer: 1024 * 1024 });
      const hosts = JSON.parse(stdout).hosts || {};
      const identities = Object.values(hosts).flat().filter(item => item.active).map(item => ({ host: item.host, login: item.login, scopes: String(item.scopes || '').split(',').map(s => s.trim()).filter(Boolean).sort() }));
      if (identities.length !== 1) throw new Error(`canonical GitHub authority requires exactly one active identity; found ${identities.length}`);
      return identities[0];
    } catch (error) {
      throw new Error(`GitHub canonical authority unavailable without interactive refresh: ${safeError(error)}`);
    }
  }

  async capabilities({ required_scopes: requiredScopes = [] } = {}) {
    const identity = await this.#status();
    const missing = requiredScopes.filter(scope => !identity.scopes.includes(scope));
    return { ok: missing.length === 0, identity: { host: identity.host, login: identity.login }, scopes: identity.scopes, required_scopes: requiredScopes, missing_scopes: missing, modelCalls: 0 };
  }

  async issueLabel({ repo, issue_number: issueNumber, label, action = 'add' } = {}) {
    if (!repo || !Number.isInteger(issueNumber) || issueNumber < 1 || !label || !['add', 'remove'].includes(action)) throw new Error('repo, positive issue_number, label and action add/remove are required');
    const capability = await this.capabilities({ required_scopes: ['repo'] });
    if (!capability.ok) throw new Error(`GitHub mutation blocked before execution: missing scope(s): ${capability.missing_scopes.join(', ')}`);
    const args = ['issue', 'edit', String(issueNumber), '--repo', repo, action === 'add' ? '--add-label' : '--remove-label', label];
    try {
      await execFileAsync(this.ghBin, args, { env: this.env, timeout: 15000, maxBuffer: 1024 * 1024 });
      return { ok: true, repo, issue_number: issueNumber, label, action, reversible_with: action === 'add' ? 'remove' : 'add', identity: capability.identity, modelCalls: 0 };
    } catch (error) {
      throw new Error(`GitHub mutation failed under canonical identity ${capability.identity.login}: ${safeError(error)}`);
    }
  }
}
