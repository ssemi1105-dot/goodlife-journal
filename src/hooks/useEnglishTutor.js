import { useEffect, useRef, useState } from 'react';
import { callTutor, tutorErrorMessage } from '../services/tutorClient';
import { getTutorTopic, makeTopicOpening } from '../../supabase/functions/english-tutor/topics.mjs';

function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function write(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private browsing. */ } }

export function useEnglishTutor(userId) { return useTutor(userId, { draftSessions: true }); }

export function useTutor(userId, { call = callTutor, storagePrefix = 'goodlife-tutor', draftSessions = false } = {}) {
  const [data, setData] = useState(null), [session, setSession] = useState(null), [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pendingKey = `${storagePrefix}-pending-${userId}`, lastKey = `${storagePrefix}-session-${userId}`;
  const topicKey = `${storagePrefix}-topic-request-${userId}`;
  const sessionDraftKey = `${storagePrefix}-session-draft-${userId}`;
  const [pending, setPending] = useState(() => read(pendingKey));
  const lock = useRef(false), mounted = useRef(false), active = useRef(null), sequence = useRef(0), pendingRef = useRef(pending);
  const sessionDraft = useRef(draftSessions ? read(sessionDraftKey) : null);
  function keepPending(value) { pendingRef.current = value; write(pendingKey, value); if (mounted.current) setPending(value); }
  function keepSessionDraft(value) { sessionDraft.current = value; write(sessionDraftKey, value); }
  function showDraft(value) { sequence.current++; active.current = value.id; setSession(value); setTurns([]); }
  async function loadSession(id) {
    const ticket = ++sequence.current;
    const result = await call('session', { sessionId: id });
    if (!mounted.current || sequence.current !== ticket) return;
    keepSessionDraft(null);
    active.current = id; write(lastKey, id); setSession(result.session); setTurns(result.turns);
    const inFlight = result.turns.find(turn => turn.state === 'pending');
    const savedPending = pendingRef.current;
    if (inFlight) keepPending({ requestId: inFlight.id, sessionId: id, content: inFlight.content, inputMode: inFlight.input_mode, voiceConfirmed: inFlight.input_mode === 'voice' });
    else if (savedPending?.sessionId === id && result.turns.some(turn => turn.id === savedPending.requestId)) keepPending(null);
    return result;
  }
  async function refresh(withSession = true) {
    const result = await call('bootstrap');
    if (!mounted.current) return;
    if (!withSession) { setData(result); return; }
    const local = sessionDraft.current;
    const current = pendingRef.current?.sessionId || active.current || local?.id || read(lastKey);
    const id = pendingRef.current?.sessionId || (result.sessions.some(item => item.id === current) ? current : local?.id || result.sessions[0]?.id);
    let loaded;
    if (local && id === local.id && !pendingRef.current && !result.sessions.some(item => item.id === id)) showDraft(local);
    else if (id) {
      try { loaded = await loadSession(id); }
      catch (err) {
        // An uncertain first send may still be in flight. Do not erase its request ID
        // merely because the new conversation is not yet in the history list.
        if (err.code !== 'SESSION_NOT_FOUND' || !pendingRef.current || !local) throw err;
        showDraft(local);
      }
    } else { active.current = null; setSession(null); setTurns([]); write(lastKey, null); }
    if (!mounted.current) return;
    // Publish readiness only after restoring the conversation, not between the two requests.
    setData(result);
    return loaded;
  }
  useEffect(() => {
    mounted.current = true;
    refresh().catch(err => { if (mounted.current) setError(err.message); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; sequence.current++; };
  }, [userId]);
  async function run(operation) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError('');
    try { return await operation(); }
    catch (err) { if (mounted.current) setError(err.message || tutorErrorMessage(err.code)); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function create(title = '일상 대화') {
    if (pendingRef.current) throw new Error('먼저 진행 중인 요청의 저장 상태를 확인해 주세요.');
    if (draftSessions) return createDraft(title);
    const result = await call('create-session', { title });
    if (mounted.current) { active.current = result.session.id; setSession(result.session); setTurns([]); write(lastKey, active.current); }
    await refresh(false);
    return result.session.id;
  }
  function createDraft(title, topicId = null) {
    const value = { id: crypto.randomUUID(), title, topic_id: topicId, opening: topicId ? makeTopicOpening(topicId, data?.profile.level) : null, isDraft: true };
    keepSessionDraft(value); showDraft(value);
    return value.id;
  }
  async function submit(payload) {
    keepPending(payload);
    let response;
    try { response = await call('send', payload); }
    catch (err) {
      // Resolve uncertain results from the server; do not make a second paid request automatically.
      if (['UNAUTHORIZED', 'TUTOR_FORBIDDEN', 'API_KEY_MISSING', 'MODEL_NOT_CONFIGURED', 'PROVIDER_REGION_INVALID', 'DAILY_LIMIT', 'GLOBAL_LIMIT', 'RATE_LIMIT', 'REQUEST_BUSY', 'SESSION_FULL', 'TOO_MANY_SESSIONS', 'SESSION_NOT_FOUND', 'INVALID_INPUT', 'VOICE_CONFIRMATION_REQUIRED', 'FUNCTION_MISSING', 'SETUP_REQUIRED'].includes(err.code)) keepPending(null);
      try {
        const loaded = await refresh();
        if (loaded?.turns.some(turn => turn.id === payload.requestId && turn.state === 'completed')) { keepPending(null); return true; }
      } catch { /* Preserve pending id and the original draft when offline. */ }
      throw err;
    }
    if (response.turn.state === 'pending') { setError('답변이 아직 처리 중입니다. 잠시 후 저장 상태를 확인해 주세요.'); return false; }
    keepPending(null);
    // A completed response confirms persistence, even if the following screen refresh fails.
    const completed = response.turn.state === 'completed';
    if (mounted.current) setTurns(current => [...current.filter(turn => turn.id !== response.turn.id), response.turn]);
    try { await loadSession(payload.sessionId); await refresh(false); }
    catch { if (mounted.current) setError(completed ? '답변은 저장됐습니다. 최신 목록은 다시 확인해 주세요.' : '최신 목록을 불러오지 못했습니다.'); }
    if (!completed && mounted.current) setError(tutorErrorMessage(response.turn.error_code));
    return completed;
  }
  async function startTopic(topicId) {
    if (pendingRef.current) throw new Error('먼저 진행 중인 요청의 저장 상태를 확인해 주세요.');
    if (draftSessions) {
      const topic = getTutorTopic(topicId);
      if (!topic) throw new Error('주제를 다시 선택해 주세요.');
      return createDraft(topic.label, topicId);
    }
    const saved = read(topicKey);
    const request = saved?.topicId === topicId ? saved : { sessionId: crypto.randomUUID(), topicId };
    write(topicKey, request);
    const result = await call('start-topic', request);
    write(topicKey, null);
    if (mounted.current) {
      active.current = result.session.id; setSession(result.session); setTurns([]); write(lastKey, active.current);
    }
    try { await refresh(false); }
    catch { if (mounted.current) setError('대화는 시작됐습니다. 최신 목록은 다시 확인해 주세요.'); }
    return result.session.id;
  }
  return { data, session, turns, loading, busy, error, pending,
    reload: () => run(() => refresh()),
    selectSession: id => run(() => loadSession(id)),
    createSession: title => run(() => create(title)),
    startTopic: topicId => run(() => startTopic(topicId)),
    send: (content, inputMode, voiceConfirmed) => run(async () => {
      if (pendingRef.current) throw new Error('먼저 진행 중인 요청의 저장 상태를 확인해 주세요.');
      const id = active.current || await create();
      return submit({ requestId: crypto.randomUUID(), sessionId: id, content: content.trim(), inputMode, voiceConfirmed,
        ...(sessionDraft.current?.id === id ? { draftSession: { topicId: sessionDraft.current.topic_id }, sentAt: Date.now() } : {}) });
    }),
    resolvePending: () => run(async () => {
      const value = pendingRef.current;
      if (!value) return false;
      // Status checks must never generate or bill another model response.
      let result;
      try { result = await loadSession(value.sessionId); }
      catch (err) {
        if (err.code !== 'SESSION_NOT_FOUND' || !value.draftSession) throw err;
        if (Date.now() - value.sentAt > 120000) {
          keepPending(null);
          setError('저장된 대화가 없습니다. 입력 내용은 유지되어 있으니 다시 제출해 주세요.');
        } else setError('첫 메시지의 저장 여부를 아직 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');
        return false;
      }
      if (!result) return false;
      const turn = result.turns.find(item => item.id === value.requestId);
      if (turn?.state === 'completed') {
        try { await refresh(false); }
        catch { if (mounted.current) setError('답변은 저장됐습니다. 최신 사용량은 다시 확인해 주세요.'); }
        return true;
      }
      if (turn?.state === 'failed') { setError(tutorErrorMessage(turn.error_code)); return false; }
      if (!turn) {
        keepPending(null);
        setError('저장된 요청이 없습니다. 입력 내용을 확인한 뒤 다시 제출해 주세요.');
      } else setError('아직 답변을 처리 중입니다. 잠시 후 저장 상태를 다시 확인해 주세요.');
      return false;
    }),
    savePreferences: (level, improvements) => run(async () => { await call('preferences', { level, improvements }); await refresh(false); return true; }),
    markReviewed: (turnId, reviewed) => run(async () => { await call('review', { turnId, reviewed }); await refresh(false); }),
    deleteSession: id => run(async () => {
      if (sessionDraft.current?.id === id) keepSessionDraft(null);
      else await call('delete-session', { sessionId: id });
      if (active.current === id) { active.current = null; write(lastKey, null); }
      await refresh();
      return true;
    }),
  };
}
