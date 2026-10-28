import { MAX_OUTPUT_TOKENS, TutorError } from './core.mjs';

export const HIVE_MODEL = 'deepseek-ai/deepseek-v4.1-flash-1017';
const ENDPOINTS = {
  global: 'https://api-cdn.thehive.ai/api/v3/chat/completions',
  va1: 'https://api-va1.thehive.ai/api/v3/chat/completions',
};
const MAX_RESPONSE_BYTES = 192000;

export function reportedTokenCount(usage) {
  const count = usage?.total_tokens;
  return Number.isInteger(count) && count >= 0 && count < 1000000 ? count : null;
}

export function hiveConfiguration(env) {
  const apiKey = env('HIVE_API_KEY'), model = env('HIVE_MODEL') || HIVE_MODEL;
  const region = env('HIVE_REGION') || 'global';
  if (!apiKey) throw new TutorError('API_KEY_MISSING', 503);
  if (model !== HIVE_MODEL) throw new TutorError('MODEL_NOT_CONFIGURED', 503);
  if (!Object.hasOwn(ENDPOINTS, region)) throw new TutorError('PROVIDER_REGION_INVALID', 503);
  return { apiKey, model, endpoint: ENDPOINTS[region] };
}

// Hive documents SSE on its V3 path. Aggregate it on the server and validate before saving.
// No automatic second call, including when a stream is incomplete or malformed.
export async function readHiveCompletion(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new TutorError('INVALID_MODEL_OUTPUT', 502, 'EMPTY_REPLY');
  const streaming = response.headers.get('content-type')?.includes('text/event-stream');
  let bytes = 0, buffer = '', content = '', reason = null, usage = null, doneMarker = false;
  let eventLines = [];
  const decoder = new TextDecoder();
  const invalid = (reason = 'INVALID_STREAM') => { throw new TutorError('INVALID_MODEL_OUTPUT', 502, reason); };
  function event() {
    if (!eventLines.length) return;
    const data = eventLines.join('\n'); eventLines = [];
    if (data.trim() === '[DONE]') { doneMarker = true; return; }
    let chunk; try { chunk = JSON.parse(data); } catch { invalid(); }
    if (!chunk || typeof chunk !== 'object' || chunk.error || (chunk.choices != null && !Array.isArray(chunk.choices))) invalid();
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices || []) {
      if (choice.index !== 0) invalid();
      if (choice.delta?.tool_calls || choice.delta?.function_call) invalid();
      if (choice.delta?.content != null) {
        if (typeof choice.delta.content !== 'string') invalid();
        content += choice.delta.content;
      }
      if (choice.finish_reason != null) reason = choice.finish_reason;
    }
  }
  function consumeLines() {
    let index;
    while (!doneMarker && (index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1);
      if (!line) event();
      else if (line.startsWith('data:')) eventLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  try {
    while (!doneMarker) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) invalid('RESPONSE_TOO_LARGE');
      buffer += decoder.decode(value, { stream: true });
      if (streaming) consumeLines();
    }
    buffer += decoder.decode();
    if (!streaming) {
      let completion; try { completion = JSON.parse(buffer); } catch { invalid('INVALID_JSON'); }
      usage = completion?.usage;
      if (completion?.choices?.[0]?.finish_reason === 'length') invalid('OUTPUT_LIMIT');
      if (completion?.choices?.[0]?.finish_reason !== 'stop') invalid('INCOMPLETE_STREAM');
      if (typeof completion.choices[0].message?.content !== 'string' || !completion.choices[0].message.content.trim()) invalid('EMPTY_REPLY');
      return completion;
    }
    if (!doneMarker) { buffer += '\n\n'; consumeLines(); }
    if (reason === 'length') invalid('OUTPUT_LIMIT');
    // Hive also documents content + usage + [DONE], without a separate stop choice.
    // A disconnected stream, missing usage, or explicit non-stop reason is not success.
    const documentedEnd = reason === null && reportedTokenCount(usage) !== null;
    if (!doneMarker || (reason !== 'stop' && !documentedEnd)) invalid('INCOMPLETE_STREAM');
    if (!content.trim()) invalid('EMPTY_REPLY');
    return { choices: [{ finish_reason: 'stop', message: { content } }], usage };
  } catch (error) {
    // A paid but invalid/truncated reply may still include reliable usage metadata.
    error.reportedTokens = reportedTokenCount(usage);
    throw error;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function requestHiveCompletion(config, messages, fetchImpl = fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST', signal: controller.signal, redirect: 'error',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ model: config.model, messages, stream: true, reasoning_effort: 'none', n: 1, max_completion_tokens: MAX_OUTPUT_TOKENS }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const code = response.status === 405 || response.status === 402 ? 'PROVIDER_BALANCE'
        : response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH'
          : response.status === 429 ? 'PROVIDER_BUSY' : 'PROVIDER_ERROR';
      throw new TutorError(code, 502);
    }
    return await readHiveCompletion(response);
  } finally { clearTimeout(timer); }
}
