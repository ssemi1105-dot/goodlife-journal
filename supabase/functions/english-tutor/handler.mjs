import { buildTutorMessages, cleanTutorFeedback, learningSummary, LEVELS, requireId, TutorError, validateSend } from './core.mjs';
import { hiveConfiguration, requestHiveCompletion } from './hiveProvider.mjs';
import { getTutorTopic, makeTopicOpening } from './topics.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const statuses = { INVALID_INPUT: 400, ADMIN_REQUIRED: 403, TARGET_USER_NOT_FOUND: 404, TUTOR_FORBIDDEN: 403, SESSION_NOT_FOUND: 404, REQUEST_NOT_FOUND: 404, REQUEST_CONFLICT: 409, REQUEST_BUSY: 409, REQUEST_EXPIRED: 409, SESSION_FULL: 409, TOO_MANY_SESSIONS: 409, DAILY_LIMIT: 429, GLOBAL_LIMIT: 429, RATE_LIMIT: 429 };
function checked(result) {
  if (!result.error) return result.data;
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(result.error.code)) throw new TutorError('SETUP_REQUIRED', 503);
  const code = Object.keys(statuses).find(key => result.error.message?.includes(key));
  throw new TutorError(code || 'DATABASE_ERROR', statuses[code] || 503);
}
function publicTurn(turn) {
  if (!turn) return null;
  const { memory, ...feedback } = turn.feedback || {};
  return { id: turn.id, session_id: turn.session_id, content: turn.content, input_mode: turn.input_mode, state: turn.state,
    error_code: turn.error_code, feedback: turn.feedback ? feedback : null, reviewed_at: turn.reviewed_at, created_at: turn.created_at, level: turn.level };
}
export async function readSmallJson(req) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new TutorError('INVALID_INPUT');
  if (Number(req.headers.get('content-length')) > 8192) throw new TutorError('INPUT_TOO_LARGE', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new TutorError('INVALID_INPUT');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new TutorError('INPUT_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new TutorError('INVALID_INPUT'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TutorError('INVALID_INPUT');
  return body;
}

export function createTutorHandler({ createClient, env, fetchImpl = fetch }) {
  return async function handler(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) throw new TutorError('SETUP_REQUIRED', 503);
      const token = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) throw new TutorError('UNAUTHORIZED', 401);
      const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const auth = await db.auth.getUser(token);
      if (auth.error || !auth.data?.user?.id) throw new TutorError('UNAUTHORIZED', 401);
      const userId = auth.data.user.id;
      const body = await readSmallJson(req);
      if (['user_id', 'userId', 'messages', 'model', 'system', 'max_tokens'].some(key => Object.hasOwn(body, key))) throw new TutorError('INVALID_INPUT');
      // Admins may grant access even when their own tutor is OFF. Never return learner content here.
      if (['admin-access-list', 'admin-set-access'].includes(body.action)) {
        const profile = checked(await db.from('profiles').select('role').eq('id', userId).maybeSingle());
        if (!['owner', 'admin'].includes(profile?.role)) throw new TutorError('ADMIN_REQUIRED', 403);
        if (body.action === 'admin-access-list') {
          const access = checked(await db.from('tutor_access').select('user_id,enabled,daily_limit').order('user_id').limit(1000));
          return json({ access });
        }
        requireId(body.targetUserId);
        if (typeof body.enabled !== 'boolean') throw new TutorError('INVALID_INPUT');
        const access = checked(await db.rpc('tutor_set_access', { p_actor_id: userId, p_target_id: body.targetUserId, p_enabled: body.enabled }));
        return json({ access });
      }
      const access = checked(await db.from('tutor_access').select('enabled,daily_limit,daily_token_limit').eq('user_id', userId).maybeSingle());
      if (!access?.enabled) throw new TutorError('TUTOR_FORBIDDEN', 403);
      const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const loadSession = async id => {
        requireId(id);
        const session = checked(await db.from('tutor_sessions').select('*').eq('id', id).eq('user_id', userId).maybeSingle());
        if (!session) throw new TutorError('SESSION_NOT_FOUND', 404);
        return session;
      };
      if (body.action === 'bootstrap') {
        checked(await db.from('tutor_profiles').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }));
        const profile = checked(await db.from('tutor_profiles').select('level,improvements').eq('user_id', userId).single());
        const sessions = checked(await db.from('tutor_sessions').select('id,title,created_at,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).order('id').limit(50));
        const usage = checked(await db.from('tutor_usage').select('requests,tokens').eq('user_id', userId).eq('day', day).maybeSingle());
        const turns = checked(await db.from('tutor_turns').select('*').eq('user_id', userId).eq('state', 'completed').order('created_at', { ascending: false }).order('id').limit(200));
        return json({ profile, sessions, usage: { day, used: usage?.requests || 0, tokens: usage?.tokens || 0, limit: access.daily_limit, tokenLimit: access.daily_token_limit },
          learning: learningSummary(turns, profile.level), review: turns.filter(turn => turn.feedback?.errors?.length || turn.feedback?.natural || turn.feedback?.english_version).map(publicTurn) });
      }
      if (body.action === 'start-topic') {
        requireId(body.sessionId);
        const topic = getTutorTopic(body.topicId);
        if (!topic) throw new TutorError('INVALID_INPUT');
        const profile = checked(await db.from('tutor_profiles').select('level').eq('user_id', userId).maybeSingle());
        const session = checked(await db.rpc('tutor_start_topic', { p_user_id: userId, p_session_id: body.sessionId,
          p_topic_id: topic.id, p_title: topic.label, p_opening: makeTopicOpening(topic.id, profile?.level) }));
        return json({ session });
      }
      if (body.action === 'create-session') {
        const title = typeof body.title === 'string' ? body.title.trim() : '일상 대화';
        if (!title || title.length > 80) throw new TutorError('INVALID_INPUT');
        const session = checked(await db.rpc('tutor_create_session', { p_user_id: userId, p_title: title }));
        return json({ session });
      }
      if (body.action === 'session') {
        const session = await loadSession(body.sessionId);
        // Expire uncertain requests without paying for another call. A retry always uses a new request id.
        const turns = checked(await db.from('tutor_turns').select('*').eq('user_id', userId).eq('session_id', session.id).order('created_at').order('id').limit(200));
        for (const turn of turns) if (turn.state === 'pending' && Date.now() - Date.parse(turn.created_at) > 120000) {
          checked(await db.rpc('tutor_fail_turn', { p_user_id: userId, p_request_id: turn.id, p_code: 'REQUEST_EXPIRED' }));
          turn.state = 'failed'; turn.error_code = 'REQUEST_EXPIRED';
        }
        return json({ session: { id: session.id, title: session.title, topic_id: session.topic_id || null, opening: session.opening || null }, turns: turns.map(publicTurn) });
      }
      if (body.action === 'preferences') {
        if (!LEVELS.includes(body.level) || typeof body.improvements !== 'boolean') throw new TutorError('INVALID_INPUT');
        checked(await db.from('tutor_profiles').upsert({ user_id: userId, level: body.level, improvements: body.improvements }, { onConflict: 'user_id' }));
        return json({ ok: true });
      }
      if (body.action === 'review') {
        requireId(body.turnId);
        if (typeof body.reviewed !== 'boolean') throw new TutorError('INVALID_INPUT');
        const rows = checked(await db.from('tutor_turns').update({ reviewed_at: body.reviewed ? new Date().toISOString() : null }).eq('user_id', userId).eq('id', body.turnId).eq('state', 'completed').select('id'));
        if (!rows.length) throw new TutorError('REQUEST_NOT_FOUND', 404);
        return json({ ok: true });
      }
      if (body.action === 'delete-session') {
        await loadSession(body.sessionId);
        checked(await db.rpc('tutor_delete_session', { p_user_id: userId, p_session_id: body.sessionId }));
        return json({ ok: true });
      }
      if (body.action !== 'send') throw new TutorError('INVALID_INPUT');
      const input = validateSend(body);
      const provider = hiveConfiguration(env);
      const session = await loadSession(body.sessionId);
      const limit = Number(env('TUTOR_GLOBAL_DAILY_LIMIT') || 100);
      const begin = checked(await db.rpc('tutor_begin_turn', { p_user_id: userId, p_session_id: body.sessionId, p_request_id: body.requestId,
        p_content: input.content, p_input_mode: input.inputMode, p_voice_confirmed: input.voiceConfirmed,
        p_global_limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 100 }));
      if (!begin.fresh) return json({ turn: publicTurn(begin.turn) });
      try {
        const previous = checked(await db.from('tutor_turns').select('content,feedback').eq('user_id', userId).eq('session_id', session.id).eq('state', 'completed').order('created_at', { ascending: false }).order('id').limit(6));
        const messages = buildTutorMessages({ profile: begin.turn, session, turns: previous.reverse(), content: input.content, inputMode: input.inputMode });
        const completion = await requestHiveCompletion(provider, messages, fetchImpl);
        if (completion.choices?.[0]?.finish_reason !== 'stop') throw new TutorError('INVALID_MODEL_OUTPUT', 502);
        let feedback;
        try { feedback = JSON.parse(completion.choices[0].message.content); } catch { throw new TutorError('INVALID_MODEL_OUTPUT', 502); }
        feedback = cleanTutorFeedback(feedback, { ...input, improvements: begin.turn.improvements, level: begin.turn.level,
          referenceSentences: previous.map(turn => turn.feedback?.natural?.sentence || turn.feedback?.english_version || (turn.feedback?.errors?.length ? turn.feedback.corrected : '')) });
        const tokenCount = completion.usage?.total_tokens;
        const finished = checked(await db.rpc('tutor_finish_turn', { p_user_id: userId, p_request_id: body.requestId, p_feedback: feedback,
          p_tokens: Number.isInteger(tokenCount) && tokenCount > 0 && tokenCount < 1000000 ? tokenCount : null }));
        return json({ turn: publicTurn(finished) });
      } catch (error) {
        const code = error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : error instanceof TutorError ? error.code : 'PROVIDER_ERROR';
        // A lost commit response may already be completed; fail RPC never changes a completed turn.
        const failed = await db.rpc('tutor_fail_turn', { p_user_id: userId, p_request_id: body.requestId, p_code: code });
        if (failed.error) return json({ code: 'STATUS_UNKNOWN' }, 503);
        throw new TutorError(code, 502);
      }
    } catch (error) {
      return json({ code: error instanceof TutorError ? error.code : 'SERVER_ERROR' }, error instanceof TutorError ? error.status : 503);
    }
  };
}
