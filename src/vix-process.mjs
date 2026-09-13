import { spawn, execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { GatewayBridge } from './gateway-bridge.mjs';

const execFileAsync = promisify(execFile);
const SYNTHETIC_PREFLIGHT_KEY = 'nova-chatgpt-loopback-only';
export const STOCK_PROVIDER_IDS = ['anthropic','bedrock','deepseek','lemonade','llamacpp','mimo','minimax','ollama','openai','openrouter'];
export const STRIPPED_PROVIDER_ENV = [
  'ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','ANTHROPIC_BASE_URL',
  'OPENAI_API_KEY','OPENAI_PROJECT_ID','OPENAI_BASE_URL',
  'OPENROUTER_API_KEY','OPENROUTER_BASE_URL',
  'MINIMAX_API_KEY','MINIMAX_BASE_URL',
  'MIMO_API_KEY','MIMO_BASE_URL',
  'DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL',
  'LEMONADE_BASE_URL','LLAMACPP_BASE_URL','OLLAMA_BASE_URL','OLLAMA_HOST',
  'AWS_BEARER_TOKEN_BEDROCK','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN',
  'AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_WEB_IDENTITY_TOKEN_FILE','AWS_ROLE_ARN',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI','AWS_CONTAINER_CREDENTIALS_FULL_URI'
];
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const SANDBOX_PROFILE = '(version 1)(allow default)(deny process-exec (literal \"/usr/bin/security\"))';

export async function validateVixExecutable(vixBin) {
  if (!vixBin || typeof vixBin !== 'string') throw new Error('Vix binary path is required');
  let p;
  try { p = await realpath(vixBin); } catch { throw new Error(`Vix binary not found: ${vixBin}`); }
  const s = await stat(p);
  if (!s.isFile() || (s.mode & 0o111) === 0) throw new Error(`Vix binary is not executable: ${vixBin}`);
  return p;
}

export async function inspectVixBinary(vixBin) {
  const p = await validateVixExecutable(vixBin);
  const { stdout, stderr } = await execFileAsync(p, ['-version'], { timeout: 10000, maxBuffer: 1024 * 1024 });
  const raw = `${stdout || stderr}`.trim();
  if (!/^vix v?\d+\./i.test(raw)) throw new Error(`Unexpected stock Vix version output: ${raw || '[empty]'}`);
  return { vixBin: p, vixVersion: raw };
}

export function buildProviderOverlay(baseUrl) {
  return {
    schema_version: 1,
    providers: STOCK_PROVIDER_IDS.map(id => ({ id, local: true, inference: { base_url: `${baseUrl}/v1` }, credential_methods: [{ kind: 'none' }] })),
    auth_logins: []
  };
}

function sanitizeError(value) { return String(value || '').replaceAll(SYNTHETIC_PREFLIGHT_KEY, '[loopback-token]').slice(-6000); }

export function isolatedEnv(baseEnv, bridge, webPort) {
  const env = { ...baseEnv };
  for (const key of STRIPPED_PROVIDER_ENV) delete env[key];
  env.ANTHROPIC_API_KEY = SYNTHETIC_PREFLIGHT_KEY;
  env.ANTHROPIC_BASE_URL = bridge.baseUrl;
  env.AWS_EC2_METADATA_DISABLED = 'true';
  env.VIX_WEB_PORT = String(webPort);
  env.VIX_TELEMETRY = 'off';
  env.NOVA_VIX_GATEWAY = bridge.baseUrl;
  return env;
}

async function getFreePort() {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise((resolveReady, rejectReady) => { server.once('error', rejectReady); server.listen(0, '127.0.0.1', resolveReady); });
  const port = server.address().port;
  await new Promise(resolveClosed => server.close(resolveClosed));
  return port;
}

export function buildLaunchSpec(executable, args, platformName = platform()) {
  if (platformName === 'darwin') return { command: SANDBOX_EXEC, args: ['-p', SANDBOX_PROFILE, executable, ...args], platformIsolation: 'macos-sandbox-exec', keychainAccessBlocked: true };
  if (platformName === 'linux') return { command: executable, args, platformIsolation: 'linux-env-overlay', keychainAccessBlocked: null };
  throw new Error(`Unsupported Vix runtime platform: ${platformName}`);
}

function spawnIsolated(executable, args, options, platformName) {
  const spec = buildLaunchSpec(executable, args, platformName);
  return { child: spawn(spec.command, spec.args, options), spec };
}

async function seedUserGlobalSkills(configDir, baseEnv) {
  const home = baseEnv?.HOME;
  if (!home) return;
  const source = join(home, '.vix', 'skills');
  try {
    const sourceStat = await stat(source);
    if (sourceStat.isDirectory()) await cp(source, join(configDir, 'skills'), { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function waitForSocket(socketPath, daemon, timeoutMs = 10000) {
  const { createConnection } = await import('node:net');
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (daemon.exitCode !== null) throw new Error(`stock vixd exited before socket became ready: ${daemon.exitCode}`);
    try {
      await new Promise((resolveReady, rejectReady) => {
        const socket = createConnection(socketPath);
        socket.once('connect', () => { socket.end(); resolveReady(); });
        socket.once('error', rejectReady);
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
  }
  throw new Error(`Timed out waiting for stock vixd socket: ${sanitizeError(lastError?.message)}`);
}

async function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise(resolveClosed => child.once('close', resolveClosed));
  child.kill('SIGTERM');
  await Promise.race([closed, new Promise(resolveWait => setTimeout(resolveWait, 500))]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([closed, new Promise(resolveWait => setTimeout(resolveWait, 500))]);
  }
}

export class VixProcessManager {
  constructor({ vixBin, baseEnv = process.env, platformName = platform() } = {}) {
    this.vixBin = vixBin;
    this.baseEnv = baseEnv;
    this.platformName = platformName;
    this.connections = new Map();
    this.modelCalls = 0;
    this.lastLaunchAudit = null;
  }

  get activeCount() { return this.connections.size; }

  async open({ cwd, prompt, workflow } = {}) {
    if (!cwd || typeof cwd !== 'string') throw new Error('cwd is required');
    if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required');
    const inspected = await inspectVixBinary(this.vixBin);
    const vixdBin = await validateVixExecutable(join(dirname(inspected.vixBin), 'vixd'));
    if (this.platformName === 'darwin') await validateVixExecutable(SANDBOX_EXEC);
    else if (this.platformName !== 'linux') throw new Error(`Unsupported Vix runtime platform: ${this.platformName}`);
    const runtimeDir = await mkdtemp(join(tmpdir(), 'nova-vix-chatgpt-'));
    const configDir = join(runtimeDir, '.vix');
    const bridge = new GatewayBridge();
    await bridge.start();
    await mkdir(configDir, { recursive: true });
    await seedUserGlobalSkills(configDir, this.baseEnv);
    await mkdir(join(runtimeDir, 'logs'), { recursive: true });
    await writeFile(join(configDir, 'providers.json'), JSON.stringify(buildProviderOverlay(bridge.baseUrl), null, 2) + '\n', { mode: 0o600 });
    const tokenPath = join(runtimeDir, 'socket-token');
    await writeFile(tokenPath, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
    const socketPath = join(runtimeDir, 'vixd.sock');
    const webPort = await getFreePort();
    const env = isolatedEnv(this.baseEnv, bridge, webPort);
    let daemon = null;
    let child = null;
    try {
      const daemonLaunch = spawnIsolated(vixdBin, ['-socket-path', socketPath, '-auth-token-path', tokenPath, '-log-dir', join(runtimeDir, 'logs'), '-web-port', String(webPort)], { cwd: runtimeDir, env, stdio: ['ignore', 'ignore', 'pipe'] }, this.platformName);
      daemon = daemonLaunch.child;
      let daemonError = '';
      daemon.stderr.setEncoding('utf8');
      daemon.stderr.on('data', chunk => { const text = sanitizeError(chunk); if (text.trim()) daemonError = text.trim(); });
      await waitForSocket(socketPath, daemon);

      const args = ['-config-dir', configDir, '-p', prompt, '-output-format', 'stream-json', '-workdir', resolve(cwd), '-socket-path', socketPath, '-auth-token-path', tokenPath];
      if (workflow) args.push('-w', workflow);
      const id = randomUUID();
      const conn = { id, bridge, child: null, daemon, runtimeDir, events: [], stdoutBuffer: '', closed: false, exitCode: null, error: daemonError || null, webPort };
      const clientLaunch = spawnIsolated(inspected.vixBin, args, { cwd: runtimeDir, env, stdio: ['ignore', 'pipe', 'pipe'] }, this.platformName);
      child = clientLaunch.child;
      conn.child = child;
      this.connections.set(id, conn);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => this.#consume(conn, chunk));
      child.stderr.on('data', chunk => { const text = sanitizeError(chunk); if (text.trim()) conn.error = text.trim(); });
      child.once('error', error => { conn.error = sanitizeError(error.message); conn.closed = true; conn.exitCode = -1; });
      child.once('close', code => { this.#consume(conn, '\n'); conn.closed = true; conn.exitCode = code; });
      daemon.once('error', error => { conn.error = sanitizeError(error.message); });
      daemon.once('close', code => { if (!conn.closed && code !== 0) conn.error = `stock vixd exited unexpectedly: ${code}`; });
      this.lastLaunchAudit = {
        gatewayBaseUrl: bridge.baseUrl,
        gatewayTls: false,
        platform: this.platformName,
        platformIsolation: daemonLaunch.spec.platformIsolation,
        keychainAccessBlocked: daemonLaunch.spec.keychainAccessBlocked,
        configDirOverrideUsed: true,
        runtimeDir,
        socketPath,
        webPort,
        stockDaemon: vixdBin,
        providerOverlayIds: [...STOCK_PROVIDER_IDS],
        realProviderEnvInherited: STRIPPED_PROVIDER_ENV.some(key => env[key] !== undefined && !((key === 'ANTHROPIC_API_KEY' && env[key] === SYNTHETIC_PREFLIGHT_KEY) || (key === 'ANTHROPIC_BASE_URL' && env[key] === bridge.baseUrl))),
        realProviderCredentialsInjected: false,
        syntheticPreflightCredential: true,
        homePreserved: env.HOME === this.baseEnv.HOME || env.HOME === undefined
      };
      return { connection_id: id, vix_version: inspected.vixVersion, modelCalls: 0 };
    } catch (error) {
      await terminateChild(child);
      await terminateChild(daemon);
      await bridge.close();
      await rm(runtimeDir, { recursive: true, force: true });
      throw error;
    }
  }

  #consume(conn, chunk) {
    conn.stdoutBuffer += chunk;
    for (;;) {
      const index = conn.stdoutBuffer.indexOf('\n');
      if (index < 0) break;
      const line = conn.stdoutBuffer.slice(0, index).trim();
      conn.stdoutBuffer = conn.stdoutBuffer.slice(index + 1);
      if (!line) continue;
      try { conn.events.push(JSON.parse(line)); } catch { conn.events.push({ type: 'stdout', text: line.slice(0, 12000) }); }
    }
  }

  #get(id) { const connection = this.connections.get(id); if (!connection) throw new Error(`Unknown Vix connection ${id}`); return connection; }

  async exchange({ connection_id: id, inference_responses: responses = [], wait_ms: waitMs = 1000 } = {}) {
    const connection = this.#get(id);
    for (const item of responses) {
      if (!item?.request_id || !item?.response) throw new Error('Each inference response requires request_id and response');
      await connection.bridge.respond(item.request_id, item.response);
    }
    const deadline = Date.now() + Math.max(0, Math.min(Number(waitMs) || 0, 30000));
    while (!connection.closed && connection.events.length === 0 && connection.bridge.queue.length === 0 && Date.now() < deadline) await new Promise(resolveWait => setTimeout(resolveWait, 10));
    return { connection_id: id, events: connection.events.splice(0), inference_requests: connection.bridge.drainRequests(), closed: connection.closed, exit_code: connection.exitCode, mission_control_url: `http://127.0.0.1:${connection.webPort}/`, modelCalls: 0, error: connection.error };
  }

  inferenceContext({ connection_id: id, request_id: requestId, pointer = '/' } = {}) {
    const connection = this.#get(id);
    return { connection_id: id, request_id: requestId, pointer, value: connection.bridge.readPendingContext(requestId, pointer) };
  }

  async closeConnection(id) {
    const connection = this.connections.get(id);
    if (!connection) return { status: 'not_found', connection_id: id };
    this.connections.delete(id);
    await terminateChild(connection.child);
    await terminateChild(connection.daemon);
    await connection.bridge.close();
    await rm(connection.runtimeDir, { recursive: true, force: true });
    return { status: 'closed', connection_id: id };
  }

  async close() { for (const id of [...this.connections.keys()]) await this.closeConnection(id); }
}
