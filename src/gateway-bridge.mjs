import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store' });
  res.end(payload);
}
function sse(eventName, data) {
  const prefix = eventName ? `event: ${eventName}\n` : '';
  return `${prefix}data: ${JSON.stringify(data)}\n\n`;
}
function safeHeaders(headers) {
  const allow = ['anthropic-version', 'anthropic-beta', 'openai-beta', 'x-nova-loopback-proof', 'content-type'];
  return Object.fromEntries(allow.flatMap(name => headers[name] === undefined ? [] : [[name, String(headers[name])]]));
}
function routeFor(pathname) {
  if (pathname === '/v1/messages') return 'anthropic_messages';
  if (pathname === '/v1/responses') return 'openai_responses';
  if (pathname === '/v1/chat/completions') return 'chat_completions';
  return null;
}
function normalized(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('response must be an object');
  if (Array.isArray(response.content)) return response;
  if (Array.isArray(response.output)) {
    const content = [];
    for (const item of response.output) {
      if (item?.type === 'message') for (const part of item.content || []) if (part?.type === 'output_text') content.push({ type: 'text', text: part.text || '' });
      if (item?.type === 'function_call') content.push({ type: 'tool_use', id: item.call_id || item.id || `call_${randomUUID()}`, name: item.name, input: typeof item.arguments === 'string' ? JSON.parse(item.arguments || '{}') : (item.arguments || {}) });
    }
    return { ...response, content };
  }
  const choice = response.choices?.[0];
  if (choice?.message || choice?.delta) {
    const msg = choice.message || choice.delta; const content = [];
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const tc of msg.tool_calls || []) content.push({ type: 'tool_use', id: tc.id || `call_${randomUUID()}`, name: tc.function?.name, input: JSON.parse(tc.function?.arguments || '{}') });
    return { ...response, content };
  }
  return { ...response, content: [{ type: 'text', text: response.text || '' }] };
}
function usageOf(response) { return { input: response?.usage?.input_tokens ?? response?.usage?.prompt_tokens ?? 0, output: response?.usage?.output_tokens ?? response?.usage?.completion_tokens ?? 0 }; }

function anthropicPayload(request, response) {
  const r = normalized(response); const usage = usageOf(r); const model = r.model || request.model || 'chatgpt-runtime';
  const stop = r.stop_reason || (r.content.some(x => x?.type === 'tool_use') ? 'tool_use' : 'end_turn');
  let out = sse('message_start', { type: 'message_start', message: { id: r.id || `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input, output_tokens: 0 } } });
  for (const [index, block] of r.content.entries()) {
    if (block?.type === 'tool_use') {
      out += sse('content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id || `toolu_${randomUUID().replaceAll('-', '')}`, name: block.name, input: {} } });
      out += sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input || {}) } });
    } else if (block?.type === 'thinking') {
      out += sse('content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
      if (block.thinking) out += sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } });
      if (block.signature) out += sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } });
    } else {
      out += sse('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      out += sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block?.text || '' } });
    }
    out += sse('content_block_stop', { type: 'content_block_stop', index });
  }
  out += sse('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: usage.output } });
  out += sse('message_stop', { type: 'message_stop' });
  return out;
}

function responsesPayload(request, response) {
  const r = normalized(response); const usage = usageOf(r); const respId = r.id || `resp_${randomUUID().replaceAll('-', '')}`; let seq = 0; let out = '';
  const emit = (type, data) => { out += sse(type, { ...data, type, sequence_number: ++seq }); };
  emit('response.created', { response: { id: respId, object: 'response', status: 'in_progress', output: [] } });
  const finalOutput = []; let outputIndex = 0;
  for (const block of r.content) {
    if (block?.type === 'tool_use') {
      const callId = block.id || `call_${randomUUID().replaceAll('-', '')}`; const args = JSON.stringify(block.input || {});
      emit('response.output_item.added', { output_index: outputIndex, item: { type: 'function_call', id: `fc_${randomUUID().replaceAll('-', '')}`, call_id: callId, name: block.name, arguments: '' } });
      emit('response.function_call_arguments.delta', { output_index: outputIndex, delta: args });
      finalOutput.push({ type: 'function_call', id: `fc_${randomUUID().replaceAll('-', '')}`, call_id: callId, name: block.name, arguments: args, status: 'completed' });
    } else if (block?.type === 'thinking') {
      const id = `rs_${randomUUID().replaceAll('-', '')}`; const text = block.thinking || '';
      emit('response.output_item.added', { output_index: outputIndex, item: { type: 'reasoning', id, summary: [] } });
      if (text) emit('response.reasoning_summary_text.delta', { output_index: outputIndex, summary_index: 0, delta: text });
      finalOutput.push({ type: 'reasoning', id, encrypted_content: 'nova-loopback', summary: text ? [{ type: 'summary_text', text }] : [] });
    } else {
      const id = `msg_${randomUUID().replaceAll('-', '')}`; const text = block?.text || '';
      emit('response.output_item.added', { output_index: outputIndex, item: { type: 'message', id, role: 'assistant', status: 'in_progress', content: [] } });
      emit('response.output_text.delta', { output_index: outputIndex, content_index: 0, item_id: id, delta: text });
      finalOutput.push({ type: 'message', id, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
    }
    outputIndex += 1;
  }
  emit('response.completed', { response: { id: respId, object: 'response', status: 'completed', output: finalOutput, usage: { input_tokens: usage.input, output_tokens: usage.output, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } });
  return out;
}

function chatPayload(request, response) {
  const r = normalized(response); const id = r.id || `chatcmpl-${randomUUID().replaceAll('-', '')}`; const model = r.model || request.model || 'chatgpt-runtime'; let out = '';
  const chunk = (delta, finish = null, usage = undefined) => { const body = { id, object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta, finish_reason: finish }] }; if (usage) body.usage = usage; out += sse('', body); };
  chunk({ role: 'assistant' });
  for (const block of r.content) {
    if (block?.type === 'tool_use') { const callId = block.id || `call_${randomUUID().replaceAll('-', '')}`; chunk({ tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: block.name, arguments: '' } }] }); chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(block.input || {}) } }] }); chunk({}, 'tool_calls'); }
    else if (block?.type !== 'thinking') chunk({ content: block?.text || '' });
  }
  if (!r.content.some(x => x?.type === 'tool_use')) chunk({}, 'stop', { prompt_tokens: r.usage?.input_tokens ?? 0, completion_tokens: r.usage?.output_tokens ?? 0, total_tokens: (r.usage?.input_tokens ?? 0) + (r.usage?.output_tokens ?? 0), prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } });
  out += 'data: [DONE]\n\n'; return out;
}

export class GatewayBridge {
  constructor({ host = '127.0.0.1', port = 0, maxBodyBytes = 12 * 1024 * 1024, requestTimeoutMs = 10 * 60 * 1000, consumedLimit = 4096 } = {}) {
    this.host = host; this.port = port; this.maxBodyBytes = maxBodyBytes; this.requestTimeoutMs = requestTimeoutMs; this.consumedLimit = consumedLimit; this.server = null; this.pending = new Map(); this.consumed = new Map(); this.queue = [];
  }
  get baseUrl() { if (!this.server) throw new Error('Gateway is not started'); return `http://${this.host}:${this.port}`; }
  async start() { if (this.server) return; this.server = createServer((req, res) => this.#handle(req, res)); await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, this.host, resolve); }); this.port = this.server.address().port; }
  async #handle(req, res) {
    try {
      const url = new URL(req.url || '/', `http://${this.host}`);
      if (req.method === 'HEAD' && url.pathname === '/api/hello') { res.writeHead(204, { 'cache-control': 'no-store' }); res.end(); return; }
      if (req.method !== 'POST') return json(res, 405, { error: { message: 'method_not_allowed' } });
      const protocol = routeFor(url.pathname); if (!protocol) return json(res, 404, { error: { message: 'not_found' } });
      let bytes = 0; const chunks = []; for await (const chunk of req) { bytes += chunk.length; if (bytes > this.maxBodyBytes) { json(res, 413, { error: { message: 'request_too_large' } }); req.destroy(); return; } chunks.push(chunk); }
      let request; try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: { message: 'invalid_json' } }); }
      if (!request || typeof request !== 'object' || Array.isArray(request)) return json(res, 400, { error: { message: 'invalid_request' } });
      const requestId = randomUUID(); const headers = safeHeaders(req.headers); const timer = setTimeout(() => { const p = this.pending.get(requestId); if (!p) return; this.pending.delete(requestId); this.#markConsumed(requestId, 'expired'); if (!res.headersSent) json(res, 504, { error: { message: 'inference_timeout' } }); else res.end(); }, this.requestTimeoutMs); timer.unref?.();
      const item = { request_id: requestId, protocol, wire_format: protocol, request, headers }; this.pending.set(requestId, { requestId, protocol, request, headers, res, timer }); this.queue.push(item);
    } catch { if (!res.headersSent) json(res, 500, { error: { message: 'gateway_error' } }); else res.end(); }
  }
  drainRequests(limit = 16) { this.queue = this.queue.filter(item => this.pending.has(item.request_id)); const count = Math.max(0, Math.min(Number(limit) || 0, this.queue.length)); return this.queue.splice(0, count); }
  pendingRequests() { return [...this.pending.values()].map(({ requestId, protocol, request, headers }) => ({ request_id: requestId, protocol, wire_format: protocol, request, headers })); }
  async waitForRequest({ timeoutMs = 30000 } = {}) { const deadline = Date.now() + timeoutMs; while (Date.now() <= deadline) { const [item] = this.drainRequests(1); if (item) return item; await new Promise(r => setTimeout(r, 10)); } throw new Error('Timed out waiting for Vix inference request'); }
  readPendingContext(requestId, pointer = '/') { const pending = this.pending.get(requestId); if (!pending) throw new Error(`No pending Vix request ${requestId}`); if (pointer === '/' || pointer === '') return pending.request; if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new Error(`Invalid JSON pointer: ${pointer}`); let value = pending.request; for (const raw of pointer.slice(1).split('/')) { const part = raw.replaceAll('~1', '/').replaceAll('~0', '~'); if (Array.isArray(value)) { if (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= value.length) throw new Error(`JSON pointer not found: ${pointer}`); value = value[Number(part)]; } else { if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error(`JSON pointer not found: ${pointer}`); value = value[part]; } } return value; }
  async respond(requestId, response) {
    if (this.consumed.has(requestId)) throw new Error(`Response for request ${requestId} was already accepted`); const pending = this.pending.get(requestId); if (!pending) throw new Error(`No pending Vix request ${requestId}`); this.pending.delete(requestId); clearTimeout(pending.timer); this.#markConsumed(requestId, 'accepted');
    let payload; if (pending.protocol === 'anthropic_messages') payload = anthropicPayload(pending.request, response); else if (pending.protocol === 'openai_responses') payload = responsesPayload(pending.request, response); else payload = chatPayload(pending.request, response);
    pending.res.writeHead(200, { 'content-type': 'text/event-stream', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store', connection: 'close' }); pending.res.end(payload); return { accepted: true, protocol: pending.protocol };
  }
  #markConsumed(id, state) { this.consumed.set(id, { state, at: Date.now() }); while (this.consumed.size > this.consumedLimit) this.consumed.delete(this.consumed.keys().next().value); }
  cancelAll() { this.queue.length = 0; for (const [id, p] of this.pending) { this.pending.delete(id); clearTimeout(p.timer); this.#markConsumed(id, 'cancelled'); if (!p.res.headersSent) json(p.res, 409, { error: { message: 'connection_cancelled' } }); else p.res.end(); } }
  async close() { this.cancelAll(); if (!this.server) return; const server = this.server; this.server = null; await new Promise(resolve => server.close(resolve)); }
}
