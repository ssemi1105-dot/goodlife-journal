import { useEffect, useRef, useState } from 'react';
import { callTutor, tutorErrorMessage } from '../services/tutorClient';

function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function write(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private browsing. */ } }

export function useEnglishTutor(userId) {
  const [data, setData] = useState(null), [session, setSession] = useState(null), [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pendingKey = `goodlife-tutor-pending-${userId}`, lastKey = `goodlife-tutor-session-${userId}`;
  const topicKey = `goodlife-tutor-topic-request-${userId}`;
  const [pending, setPending] = useState(() => read(pendingKey));
  const lock = useRef(false), mounted = useRef(false), active = useRef(null), sequence = useRef(0), pendingRef = useRef(pending);
  function keepPending(value) { pendingRef.current = value; write(pendingKey, value); if (mounted.current) setPending(value); }
  async function loadSession(id) {
    const ticket = ++sequence.current;
    const result = await callTutor('session', { sessionId: id });
    if (!mounted.current || sequence.current !== ticket) return;
    active.current = id; write(lastKey, id); setSession(result.session); setTurns(result.turns);
    const inFlight = result.turns.find(turn => turn.state === 'pending');
    const savedPending = pendingRef.current;
    if (inFlight) keepPending({ requestId: inFlight.id, sessionId: id, content: inFlight.content, inputMode: inFlight.input_mode, voiceConfirmed: inFlight.input_mode === 'voice' });
    else if (savedPending?.sessionId === id && result.turns.some(turn => turn.id === savedPending.requestId)) keepPending(null);
    return result;
  }
  async function refresh(withSession = true) {
    const result = await callTutor('bootstrap');
    if (!mounted.current) return;
    setData(result);
    const current = active.current || pendingRef.current?.sessionId || read(lastKey) || result.sessions[0]?.id;
    if (pendingRef.current && !result.sessions.some(item => item.id === pendingRef.current.sessionId)) keepPending(null);
    const id = result.sessions.some(item => item.id === current) ? current : result.sessions[0]?.id;
    if (withSession && id) return loadSession(id);
    if (!id) { active.current = null; setSession(null); setTurns([]); write(lastKey, null); keepPending(null); }
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
    const result = await callTutor('create-session', { title });
    if (mounted.current) { active.current = result.session.id; setSession(result.session); setTurns([]); write(lastKey, active.current); }
    await refresh(false);
    return result.session.id;
  }
  async function submit(payload) {
    keepPending(payload);
    let response;
    try { response = await callTutor('send', payload); }
    catch (err) {
      // Resolve uncertain results from the server; do not make a second paid request automatically.
      if (['UNAUTHORIZED', 'TUTOR_FORBIDDEN', 'API_KEY_MISSING', 'MODEL_NOT_CONFIGURED', 'PROVIDER_REGION_INVALID', 'DAILY_LIMIT', 'GLOBAL_LIMIT', 'RATE_LIMIT', 'REQUEST_BUSY', 'SESSION_FULL', 'SESSION_NOT_FOUND', 'INVALID_INPUT', 'VOICE_CONFIRMATION_REQUIRED', 'FUNCTION_MISSING', 'SETUP_REQUIRED'].includes(err.code)) keepPending(null);
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
    const saved = read(topicKey);
    const request = saved?.topicId === topicId ? saved : { sessionId: crypto.randomUUID(), topicId };
    write(topicKey, request);
    const result = await callTutor('start-topic', request);
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
      return submit({ requestId: crypto.randomUUID(), sessionId: id, content: content.trim(), inputMode, voiceConfirmed });
    }),
    resolvePending: () => run(async () => { const value = pendingRef.current; return value ? submit(value) : false; }),
    savePreferences: (level, improvements) => run(async () => { await callTutor('preferences', { level, improvements }); await refresh(false); return true; }),
    markReviewed: (turnId, reviewed) => run(async () => { await callTutor('review', { turnId, reviewed }); await refresh(false); }),
    deleteSession: id => run(async () => {
      await callTutor('delete-session', { sessionId: id });
      if (active.current === id) { active.current = null; write(lastKey, null); }
      await refresh();
    }),
  };
}
