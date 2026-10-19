import { useEffect, useRef, useState } from 'react';
import { useEnglishTutor } from '../hooks/useEnglishTutor';
import { tutorErrorMessage } from '../services/tutorClient';
import CompactToggle from './ui/CompactToggle';
import './EnglishTutor.css';

const LEVELS = ['A2', 'B1', 'B1+'];
const TYPES = { tense: '시제', verb_form: '동사 형태', article: '관사', plural: '복수형', preposition: '전치사', word_order: '어순', word_choice: '단어 선택', spelling: '철자', agreement: '수 일치', other: '기타' };
const TOPICS = ['오늘 하루', '여행 준비', '식당에서', '회사에서'];
function loadDraft(key) { try { const value = JSON.parse(sessionStorage.getItem(key) || '{}'); return typeof value.text === 'string' ? value : { text: '', mode: 'text', confirmed: false }; } catch { return { text: '', mode: 'text', confirmed: false }; } }
function timestamp(value) { return new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function Feedback({ feedback, onSpeak }) {
  return <div className="tutor-feedback">
    <div className="tutor-answer"><span className="tutor-speaker">MINA</span><p lang="en">{feedback.tutor_reply}</p>
      {onSpeak && <button type="button" className="tutor-icon" title="영어 답변 듣기" aria-label="영어 답변 듣기" onClick={() => onSpeak(feedback.tutor_reply)}>▷</button>}
    </div>
    {!!feedback.errors.length && <div className="tutor-correction"><h3>교정</h3><p lang="en">{feedback.corrected}</p>
      <ul>{feedback.errors.map((error, index) => <li key={index}><span>{TYPES[error.type] || '표현'}</span> {error.explanation_ko}</li>)}</ul>
    </div>}
    {feedback.english_version && <div className="tutor-translation"><h3>영어로 표현하면</h3><p lang="en">{feedback.english_version}</p></div>}
    {!!feedback.improvements.length && <details className="tutor-improvements"><summary>더 자연스럽게</summary>{feedback.improvements.map((item, index) => <div key={index}><p lang="en">{item.suggestion}</p><small>{item.reason_ko}</small></div>)}</details>}
    {feedback.flags.stt_suspected && <p className="tutor-note">음성 인식이 불명확해 오류 평가에서 제외했습니다.</p>}
  </div>;
}

export default function EnglishTutor({ userId, onBack }) {
  const tutor = useEnglishTutor(userId);
  const [tab, setTab] = useState('chat');
  const draftKey = `goodlife-tutor-draft-${userId}`;
  const [draft, setDraft] = useState(() => loadDraft(draftKey));
  const [listening, setListening] = useState(false), [voiceError, setVoiceError] = useState(''), [language, setLanguage] = useState('en-US');
  const inputRef = useRef(null), scrollRef = useRef(null), recognition = useRef(null), voiceConsent = useRef(false), speaking = useRef(false);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window;
  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Keep an in-memory draft if storage is blocked. */ } }, [draft, draftKey]);
  useEffect(() => () => { if (recognition.current) { recognition.current.onend = null; recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.abort(); } if (speaking.current) window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { const area = scrollRef.current; if (area && tab === 'chat') area.scrollTop = area.scrollHeight; }, [tutor.turns.length, tutor.busy, tab, tutor.session?.id]);
  // Only this screen tracks the visual viewport, keeping the composer above Android/iOS keyboards.
  const [viewportHeight, setViewportHeight] = useState(() => window.visualViewport?.height || window.innerHeight);
  useEffect(() => {
    const update = () => setViewportHeight(window.visualViewport?.height || window.innerHeight);
    window.visualViewport?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { window.visualViewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, []);
  const keyboardOpen = window.innerHeight - viewportHeight > 120;
  function stopAudio() { recognition.current?.abort(); if (speaking.current) { window.speechSynthesis?.cancel(); speaking.current = false; } }
  function speak(text) {
    stopAudio(); setVoiceError('');
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = tutor.data?.profile.level === 'A2' ? .85 : .95;
    const englishVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.startsWith('en'));
    if (englishVoice) utterance.voice = englishVoice;
    utterance.onerror = event => { if (!['canceled', 'interrupted'].includes(event.error)) setVoiceError('이 기기에서 음성을 재생하지 못했습니다.'); };
    speaking.current = true; window.speechSynthesis.speak(utterance);
  }
  function startVoice() {
    if (listening) { recognition.current?.stop(); return; }
    if (!Recognition) return;
    if (!voiceConsent.current && !window.confirm('음성 인식은 브라우저의 외부 서비스로 음성이 전송될 수 있습니다. 마이크를 사용할까요?')) return;
    voiceConsent.current = true; stopAudio(); setVoiceError('');
    const instance = new Recognition(); recognition.current = instance;
    instance.lang = language; instance.continuous = false; instance.interimResults = false;
    instance.onstart = () => setListening(true); instance.onend = () => setListening(false);
    instance.onerror = () => { setListening(false); setVoiceError('음성을 인식하지 못했습니다. 마이크 권한을 확인하거나 직접 입력해 주세요.'); };
    instance.onresult = event => {
      const text = [...event.results].map(result => result[0].transcript).join(' ');
      setDraft(current => ({ text: `${current.text}${current.text ? ' ' : ''}${text}`.slice(0, 1000), mode: 'voice', confirmed: false }));
    };
    try { instance.start(); } catch { setListening(false); setVoiceError('음성 인식을 시작하지 못했습니다.'); }
  }
  function clearSubmittedDraft(text) {
    if (loadDraft(draftKey).text.trim() === text.trim()) {
      try { sessionStorage.removeItem(draftKey); } catch { /* The in-memory draft still clears below. */ }
    }
    setDraft(current => current.text.trim() === text.trim() ? { text: '', mode: 'text', confirmed: false } : current);
  }
  async function send(event) {
    event.preventDefault();
    if (!draft.text.trim() || tutor.busy || tutor.pending || listening || (draft.mode === 'voice' && !draft.confirmed)) return;
    if (await tutor.send(draft.text, draft.mode, draft.confirmed)) clearSubmittedDraft(draft.text);
  }
  function changeTab(next) { stopAudio(); setTab(next); }
  const reviewItems = tutor.data?.review || [];
  const remaining = reviewItems.filter(turn => !turn.reviewed_at);
  const counts = Object.entries(tutor.data?.learning.counts || {}).sort((a, b) => b[1] - a[1]);
  const unavailable = !tutor.data && !tutor.loading;
  return <main className={`screen tutor-screen ${keyboardOpen ? 'tutor-keyboard-open' : ''}`} style={{ '--tutor-height': `${viewportHeight}px` }}>
    <header className="tutor-header">
      <button type="button" className="tutor-icon" title="뒤로" aria-label="뒤로" onClick={onBack}>←</button>
      <div><h1>영어 튜터</h1><span>Mina {tutor.data ? `· ${tutor.data.profile.level}` : ''}</span></div>
      {tutor.data && <span className="tutor-usage" title="한국 시간 자정 기준 호출 횟수. 실패한 요청도 한도에 포함될 수 있습니다.">오늘 {tutor.data.usage.used}/{tutor.data.usage.limit}</span>}
    </header>
    {tutor.data && <div className="tutor-tabs" role="tablist" aria-label="영어 학습">
      {[['chat', '대화'], ['review', `복습${remaining.length ? ` ${remaining.length}` : ''}`], ['settings', '학습 설정']].map(([id, label]) => <button key={id} type="button" role="tab" id={`tutor-tab-${id}`} aria-controls={`tutor-panel-${id}`} aria-selected={tab === id} onClick={() => changeTab(id)}>{label}</button>)}
    </div>}
    {tutor.loading && <p className="tutor-state" role="status">학습 기록 불러오는 중…</p>}
    {(tutor.error || voiceError) && <div className="tutor-error" role="alert"><span>{tutor.error || voiceError}</span>
      {!tutor.pending && <button type="button" disabled={tutor.busy} onClick={() => { setVoiceError(''); tutor.reload(); }}>다시 확인</button>}
    </div>}
    {unavailable && <div className="tutor-state"><h2>아직 연결되지 않았어요</h2><p>서버 배포와 계정 사용 허가가 완료되면 시작할 수 있습니다.</p></div>}
    {tutor.data && tab === 'chat' && <section className="tutor-chat" role="tabpanel" id="tutor-panel-chat" aria-labelledby="tutor-tab-chat">
      <div className="tutor-session-bar">
        <select aria-label="대화 선택" value={tutor.session?.id || ''} disabled={tutor.busy || !!tutor.pending} onChange={event => tutor.selectSession(event.target.value)}>
          {!tutor.session && <option value="">새 대화</option>}
          {tutor.data.sessions.map(session => <option key={session.id} value={session.id}>{session.title} · {new Date(session.created_at).toLocaleDateString('ko-KR')}</option>)}
        </select>
        <button type="button" className="tutor-icon" aria-label="새 대화" title="새 대화" disabled={tutor.busy || !!tutor.pending} onClick={() => tutor.createSession()}>＋</button>
        <button type="button" className="tutor-icon" aria-label="대화 삭제" title="대화 삭제" disabled={!tutor.session || tutor.busy || !!tutor.pending} onClick={() => { if (window.confirm('이 대화와 교정·복습 기록을 삭제할까요? 사용량은 초기화되지 않습니다.')) tutor.deleteSession(tutor.session.id); }}>×</button>
      </div>
      <div className="tutor-conversation" ref={scrollRef} aria-label="영어 대화 내역" aria-busy={tutor.busy}>
        {!tutor.turns.length && <div className="tutor-welcome"><span className="tutor-speaker">MINA</span><h2 lang="en">How was your day?</h2><div className="tutor-topics">{TOPICS.map(topic => <button type="button" key={topic} disabled={tutor.busy || !!tutor.pending} onClick={() => tutor.createSession(topic)}>{topic}</button>)}</div><p className="tutor-note">보낸 학습 대화는 Hive의 DeepSeek 모델에서 처리하며 API 사용료가 발생합니다. 민감한 개인정보는 입력하지 마세요.</p></div>}
        {tutor.turns.map(turn => <article className="tutor-turn" key={turn.id}>
          <div className="tutor-user"><span>나 <time>{timestamp(turn.created_at)}</time></span><p>{turn.content}</p></div>
          {turn.state === 'completed' && <Feedback feedback={turn.feedback} onSpeak={canSpeak ? speak : null} />}
          {turn.state === 'pending' && <p className="tutor-note" role="status">답변을 준비하고 있어요…</p>}
          {turn.state === 'failed' && <div className="tutor-failed"><p>{tutorErrorMessage(turn.error_code)}</p><button type="button" disabled={tutor.busy || !!tutor.pending} onClick={() => { setDraft({ text: turn.content, mode: 'text', confirmed: false }); inputRef.current?.focus(); }}>입력창으로 가져오기</button></div>}
        </article>)}
        {tutor.busy && <p className="tutor-note" role="status">처리 중…</p>}
      </div>
      <form className="tutor-composer" onSubmit={send}>
        {!!tutor.pending && <div className="tutor-pending"><span>이전 요청 확인이 필요합니다.</span><button type="button" disabled={tutor.busy} onClick={async () => { const content = tutor.pending.content; if (await tutor.resolvePending()) clearSubmittedDraft(content); }}>저장 상태 확인</button></div>}
        <label className="tutor-input-label" htmlFor="tutor-message">메시지 <span>{draft.text.length}/1,000</span></label>
        <div className="tutor-input-row"><textarea id="tutor-message" ref={inputRef} value={draft.text} maxLength={1000} rows={2} disabled={tutor.busy || listening || !!tutor.pending} placeholder="오늘 있었던 일을 이야기해 보세요" onChange={event => setDraft(current => ({ ...current, text: event.target.value }))} />
          <button type="submit" className="tutor-send" aria-label="메시지 전송" title="메시지 전송" disabled={!draft.text.trim() || tutor.busy || listening || !!tutor.pending || (draft.mode === 'voice' && !draft.confirmed)}>↑</button>
        </div>
        <div className="tutor-compose-tools">
          {Recognition && <><button type="button" className="tutor-voice-button" disabled={tutor.busy || !!tutor.pending} aria-pressed={listening} onClick={startVoice}>{listening ? '인식 종료' : '음성 입력'}</button><select aria-label="음성 인식 언어" value={language} disabled={listening} onChange={event => setLanguage(event.target.value)}><option value="en-US">영어</option><option value="ko-KR">한국어</option></select></>}
          {canSpeak && <button type="button" className="tutor-icon tutor-stop-audio" title="음성 재생 정지" aria-label="음성 재생 정지" onClick={stopAudio}>■</button>}
        </div>
        {draft.mode === 'voice' && <label className="tutor-voice-confirm"><input type="checkbox" checked={draft.confirmed} onChange={event => setDraft(current => ({ ...current, confirmed: event.target.checked }))} />인식된 문장을 확인했습니다</label>}
      </form>
    </section>}
    {tutor.data && tab === 'review' && <section className="tutor-scroll-panel" role="tabpanel" id="tutor-panel-review" aria-labelledby="tutor-tab-review">
      <div className="tutor-review-heading"><h2>다시 볼 표현</h2><span>{remaining.length}건 남음</span></div>
      {reviewItems.map(turn => <article className={`tutor-review-item ${turn.reviewed_at ? 'is-reviewed' : ''}`} key={turn.id}><time>{timestamp(turn.created_at)}</time>
        {turn.feedback.errors.map((error, i) => <div className="tutor-review-pair" key={i}><del lang="en">{error.original}</del><strong lang="en">{error.corrected}</strong><p>{error.explanation_ko}</p></div>)}
        <button type="button" aria-pressed={!!turn.reviewed_at} disabled={tutor.busy} onClick={() => tutor.markReviewed(turn.id, !turn.reviewed_at)}>{turn.reviewed_at ? '복습 완료 취소' : '복습 완료'}</button>
      </article>)}
      {!reviewItems.length && <p className="tutor-state">아직 복습할 표현이 없습니다.</p>}
      <small className="tutor-note">최근 학습 200회를 기준으로 표시합니다.</small>
    </section>}
    {tutor.data && tab === 'settings' && <section className="tutor-scroll-panel" role="tabpanel" id="tutor-panel-settings" aria-labelledby="tutor-tab-settings">
      <section className="tutor-setting-section"><h2>학습 수준</h2><div className="tutor-levels">{LEVELS.map(level => <button type="button" key={level} aria-pressed={tutor.data.profile.level === level} disabled={tutor.busy || !!tutor.pending} onClick={() => tutor.savePreferences(level, tutor.data.profile.improvements)}>{level}</button>)}</div>
        {tutor.data.learning.recommendation && <div className="tutor-recommendation"><span>{tutor.data.learning.recommendation} 단계도 연습해 볼까요?</span><button type="button" disabled={tutor.busy} onClick={() => tutor.savePreferences(tutor.data.learning.recommendation, tutor.data.profile.improvements)}>변경</button></div>}
        <p className="tutor-note">공인 시험 점수가 아닌 학습 난이도입니다. 수준은 자동으로 바뀌지 않습니다.</p>
      </section>
      <section className="tutor-setting-section"><CompactToggle checked={tutor.data.profile.improvements} disabled={tutor.busy || !!tutor.pending} onChange={enabled => tutor.savePreferences(tutor.data.profile.level, enabled)} label="자연스러운 표현 제안" /></section>
      <section className="tutor-setting-section"><h2>최근 교정 유형</h2>{counts.map(([type, count]) => <div className="tutor-stat-row" key={type}><span>{TYPES[type] || type}</span><strong>{count}회</strong></div>)}{!counts.length && <p className="tutor-note">아직 교정 통계가 없습니다.</p>}<small className="tutor-note">최근 {tutor.data.learning.sampleSize}회 대화 기준 · 같은 유형은 대화당 한 번 집계</small></section>
      <section className="tutor-setting-section"><h2>사용량·개인정보</h2><div className="tutor-stat-row"><span>오늘 요청</span><strong>{tutor.data.usage.used}/{tutor.data.usage.limit}회</strong></div><div className="tutor-stat-row"><span>사용·예약 토큰</span><strong>{tutor.data.usage.tokens.toLocaleString()}/{tutor.data.usage.tokenLimit.toLocaleString()}</strong></div>
        <p className="tutor-note">학습 대화는 Hive의 DeepSeek 모델에 전송되며 API 사용료가 발생합니다. 다른 카테고리의 기록은 전송하지 않습니다. 실패하거나 결과가 불확실한 요청도 사용 한도에 포함될 수 있습니다.</p>
        <p className="tutor-note">AI 교정과 수준 추천은 틀릴 수 있습니다. 음성은 원본 녹음 없이 인식된 문장만 저장합니다.</p>
      </section>
    </section>}
  </main>;
}
