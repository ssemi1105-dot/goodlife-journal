import { useEffect, useRef, useState } from 'react';
import { useEnglishTutor } from '../hooks/useEnglishTutor';
import { callTutor, tutorErrorMessage } from '../services/tutorClient';
import { useTutorStudy } from '../hooks/useTutorStudy';
import { TutorStudyReview, TutorSaveTurn, StudyError } from './TutorStudy';
import CompactToggle from './ui/CompactToggle';
import TutorFeedback, { ERROR_LABELS } from './TutorFeedback';
import TutorTopics from './TutorTopics';
import TutorUsageSummary, { TutorUsageNote } from './TutorUsageSummary';
import TutorHeader from './TutorHeader';
import TutorSessionHistory from './TutorSessionHistory';
import TutorComposer from './TutorComposer';
import './EnglishTutor.css';

const LEVELS = [['A2', '쉬운 대화'], ['B1', '일상 대화'], ['B1+', '표현 확장']];
function loadDraft(key) { try { const value = JSON.parse(sessionStorage.getItem(key) || '{}'); return typeof value.text === 'string' ? value : { text: '', mode: 'text', confirmed: false }; } catch { return { text: '', mode: 'text', confirmed: false }; } }
function timestamp(value) { return new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function EnglishTutor({ userId, onBack }) {
  const tutor = useEnglishTutor(userId);
  const study = useTutorStudy(userId, 'en', callTutor, !!tutor.data && !tutor.loading);
  const [tab, setTab] = useState('chat');
  const [choosingTopic, setChoosingTopic] = useState(false), [practiceText, setPracticeText] = useState('');
  const draftKey = `goodlife-tutor-draft-${userId}`;
  const [draft, setDraft] = useState(() => loadDraft(draftKey));
  const [listening, setListening] = useState(false), [voiceError, setVoiceError] = useState(''), [language, setLanguage] = useState('en-US');
  const inputRef = useRef(null), scrollRef = useRef(null), recognition = useRef(null), voiceConsent = useRef(false), speaking = useRef(false);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window;
  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Keep an in-memory draft if storage is blocked. */ } }, [draft, draftKey]);
  useEffect(() => () => { if (recognition.current) { recognition.current.onend = null; recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.abort(); } if (speaking.current) window.speechSynthesis?.cancel(); }, []);
  useEffect(() => {
    const area = scrollRef.current;
    if (!area || tab !== 'chat') return;
    if (choosingTopic || !tutor.turns.length) { area.scrollTop = 0; return; }
    const last = area.querySelector('.tutor-turn:last-of-type');
    const target = last?.querySelector('.tutor-feedback') || last;
    if (target) area.scrollTop += target.getBoundingClientRect().top - area.getBoundingClientRect().top;
  }, [tutor.turns.length, tutor.busy, tutor.loading, tab, tutor.session?.id, choosingTopic]);
  useEffect(() => { if (practiceText && tab === 'chat') inputRef.current?.focus(); }, [practiceText, tab]);
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
  function startVoice(languageOverride) {
    if (listening) { recognition.current?.stop(); return; }
    if (!Recognition) return;
    if (!voiceConsent.current && !window.confirm('음성 인식은 브라우저의 외부 서비스로 음성이 전송될 수 있습니다. 마이크를 사용할까요?')) return;
    voiceConsent.current = true; stopAudio(); setVoiceError('');
    const instance = new Recognition(); recognition.current = instance;
    instance.lang = typeof languageOverride === 'string' ? languageOverride : language; instance.continuous = false; instance.interimResults = false;
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
    if (!draft.text.trim() || tutor.loading || tutor.busy || tutor.pending || listening || (draft.mode === 'voice' && !draft.confirmed)) return;
    if (await tutor.send(draft.text, draft.mode, draft.confirmed)) { clearSubmittedDraft(draft.text); setPracticeText(''); }
  }
  function practice(expression) {
    if (tutor.loading || tutor.busy || tutor.pending || listening) return;
    if (draft.text.trim() && !window.confirm('작성 중인 문장을 지우고 연습할까요?')) return;
    stopAudio(); setTab('chat'); setChoosingTopic(false); setPracticeText(expression);
    setDraft({ text: '', mode: 'text', confirmed: false }); setLanguage('en-US');
    inputRef.current?.focus();
    if (Recognition) startVoice('en-US');
  }
  async function startConversation(topicId) {
    if (tutor.loading || tutor.busy || tutor.pending || listening) return;
    if (draft.text.trim() && !window.confirm('작성 중인 문장은 입력창에 유지됩니다. 새 대화를 시작할까요?')) return;
    stopAudio();
    const id = topicId ? await tutor.startTopic(topicId) : await tutor.createSession();
    if (id) { setChoosingTopic(false); setPracticeText(''); }
    return id;
  }
  function changeTab(next) { stopAudio(); setTab(next); }
  function chooseTopic() {
    if (locked) return;
    stopAudio(); setTab('chat'); setChoosingTopic(true);
  }
  const reviewItems = tutor.data?.review || [];
  const remaining = reviewItems.filter(turn => !turn.reviewed_at);
  const counts = Object.entries(tutor.data?.learning.counts || {}).sort((a, b) => b[1] - a[1]);
  const unavailable = !tutor.data && !tutor.loading;
  const ready = !!tutor.data && !tutor.loading;
  const showTopics = choosingTopic;
  const locked = tutor.loading || tutor.busy || !!tutor.pending || listening;
  return <main className={`screen tutor-screen ${keyboardOpen ? 'tutor-keyboard-open' : ''}`} style={{ '--tutor-height': `${viewportHeight}px` }}>
    <TutorHeader title="영어 튜터" subtitle={`Mina${tutor.data ? ` · ${LEVELS.find(([id]) => id === tutor.data.profile.level)?.[1] || tutor.data.profile.level}` : ''}`} onBack={onBack} ready={ready} tab={tab} historyFirst
      onChooseTopic={chooseTopic} topicsOpen={showTopics} topicDisabled={locked}
      tabs={[[ 'chat', '대화' ], ['review', `복습${remaining.length ? ` ${remaining.length}` : ''}`], ['settings', '학습 설정']]} onTabChange={changeTab} onOpenMenu={stopAudio}>
      {close => <TutorSessionHistory sessions={tutor.data.sessions} selectedId={tutor.session?.id} disabled={locked} error={tutor.error}
        onSelect={async id => { stopAudio(); if (await tutor.selectSession(id)) { setTab('chat'); setChoosingTopic(false); setPracticeText(''); close(); } }}
        onCreate={async () => { if (await startConversation(null)) { setTab('chat'); close(); } }}
        onDelete={async id => { if (window.confirm('이 대화와 교정 기록을 삭제할까요? 별도로 저장한 표현과 사용량은 유지됩니다.')) { stopAudio(); await tutor.deleteSession(id); } }} />}
    </TutorHeader>
    {tutor.loading && <p className="tutor-state" role="status">학습 기록 불러오는 중…</p>}
    {(tutor.error || voiceError) && <div className="tutor-error" role="alert"><span>{tutor.error || voiceError}</span>
      {!tutor.pending && <button type="button" disabled={tutor.busy} onClick={() => { setVoiceError(''); tutor.reload(); }}>다시 확인</button>}
    </div>}
    {unavailable && <div className="tutor-state"><h2>아직 연결되지 않았어요</h2><p>서버 배포와 계정 사용 허가가 완료되면 시작할 수 있습니다.</p></div>}
    {ready && tab === 'chat' && <section className="tutor-chat" role="tabpanel" aria-label="영어 대화">
      <div className="tutor-conversation" ref={scrollRef} aria-label="영어 대화 내역" aria-busy={tutor.busy}>
        {showTopics && <TutorTopics disabled={locked} onSelect={startConversation} onFree={() => startConversation(null)} onClose={() => setChoosingTopic(false)} />}
        {!showTopics && tutor.session?.opening && <section className="tutor-opening" aria-label="튜터 시작 질문">
          <span className="tutor-speaker">MINA · {tutor.session.title}</span>
          <p className="tutor-opening-role">{tutor.session.opening.role}</p>
          <div className="tutor-answer"><p lang="en">{tutor.session.opening.question}</p>
            {canSpeak && <button type="button" className="tutor-icon" aria-label="시작 질문 듣기" title="시작 질문 듣기" onClick={() => speak(tutor.session.opening.question)}>▷</button>}
          </div>
        </section>}
        {!showTopics && !tutor.turns.length && !tutor.session?.opening && <div className="tutor-welcome"><span className="tutor-speaker">MINA</span><h2 lang="en">How was your day?</h2><button type="button" className="tutor-free-chat" disabled={locked} onClick={() => setChoosingTopic(true)}>주제 고르기</button></div>}
        {!tutor.turns.length && <p className="tutor-note">보낸 학습 대화는 Hive의 DeepSeek 모델에서 처리하며 API 사용료가 발생합니다. 민감한 개인정보는 입력하지 마세요.</p>}
        {!showTopics && tutor.turns.map(turn => <article className="tutor-turn" key={turn.id}>
          <div className="tutor-user"><span>나 <time>{timestamp(turn.created_at)}</time></span><p>{turn.content}</p></div>
          {turn.state === 'completed' && <><TutorFeedback feedback={turn.feedback} onSpeak={canSpeak ? speak : null} onPractice={practice} disabled={locked} /><TutorSaveTurn turn={turn} study={study} /></>}
          {turn.state === 'pending' && <p className="tutor-note" role="status">답변을 준비하고 있어요…</p>}
          {turn.state === 'failed' && <div className="tutor-failed"><p>{tutorErrorMessage(turn.error_code)}</p><button type="button" disabled={tutor.busy || !!tutor.pending} onClick={() => { setDraft({ text: turn.content, mode: 'text', confirmed: false }); inputRef.current?.focus(); }}>입력창으로 가져오기</button></div>}
        </article>)}
        {!showTopics && <StudyError study={study} />}
        {tutor.busy && <p className="tutor-note" role="status">처리 중…</p>}
      </div>
      <TutorComposer id="tutor-message" inputRef={inputRef} draft={draft} onDraftChange={setDraft} onSubmit={send} hidden={showTopics}
        busy={tutor.busy} pending={!!tutor.pending} listening={listening} supported={!!Recognition} onVoice={startVoice} onStop={canSpeak ? stopAudio : null}
        language={language} onLanguageChange={setLanguage} languages={[[ 'en-US', '영어' ], ['ko-KR', '한국어']]} languageLabel="음성 인식 언어" submitLabel="메시지 제출하기"
        placeholder={tutor.session?.opening ? '질문에 답해 보세요' : '오늘 있었던 일을 이야기해 보세요'}>
        {practiceText && <div className="tutor-practice-target"><div><span>따라 말하기</span><button type="button" className="tutor-icon" aria-label="따라 말하기 닫기" title="닫기" disabled={listening} onClick={() => setPracticeText('')}>×</button></div><p lang="en">{practiceText}</p></div>}
        {!!tutor.pending && <div className="tutor-pending"><span>이전 요청 확인이 필요합니다.</span><button type="button" disabled={tutor.busy} onClick={async () => { const content = tutor.pending.content; if (await tutor.resolvePending()) clearSubmittedDraft(content); }}>저장 상태 확인</button></div>}
      </TutorComposer>
    </section>}
    {ready && tab === 'review' && <section className="tutor-scroll-panel" role="tabpanel" aria-label="영어 복습">
      <TutorStudyReview study={study} language="en" onSpeak={canSpeak ? speak : null} />
      <details className="study-upcoming"><summary>대화에서 배운 표현 {reviewItems.length}건</summary>
      <div className="tutor-review-heading"><h2>다시 볼 표현</h2><span>{remaining.length}건 남음</span></div>
      {reviewItems.map(turn => <article className={`tutor-review-item ${turn.reviewed_at ? 'is-reviewed' : ''}`} key={turn.id}><time>{timestamp(turn.created_at)}</time>
        <TutorFeedback feedback={turn.feedback} onSpeak={canSpeak ? speak : null} onPractice={practice} disabled={locked} showReply={false} />
        <TutorSaveTurn turn={turn} study={study} />
        <button type="button" aria-pressed={!!turn.reviewed_at} disabled={tutor.busy} onClick={() => tutor.markReviewed(turn.id, !turn.reviewed_at)}>{turn.reviewed_at ? '복습 완료 취소' : '복습 완료'}</button>
      </article>)}
      {!reviewItems.length && <p className="tutor-state">아직 복습할 표현이 없습니다.</p>}
      <small className="tutor-note">최근 학습 200회를 기준으로 표시합니다.</small>
      </details>
    </section>}
    {ready && tab === 'settings' && <section className="tutor-scroll-panel" role="tabpanel" aria-label="영어 학습 설정">
      <section className="tutor-setting-section"><h2>답변 난이도</h2><div className="tutor-levels tutor-difficulty">{LEVELS.map(([level, label]) => <button type="button" key={level} aria-pressed={tutor.data.profile.level === level} disabled={tutor.busy || !!tutor.pending} onClick={() => tutor.savePreferences(level, tutor.data.profile.improvements)}><strong>{label}</strong><small>{level}</small></button>)}</div>
        {tutor.data.learning.recommendation && <div className="tutor-recommendation"><span>{tutor.data.learning.recommendation} 단계도 연습해 볼까요?</span><button type="button" disabled={tutor.busy} onClick={() => tutor.savePreferences(tutor.data.learning.recommendation, tutor.data.profile.improvements)}>변경</button></div>}
        <p className="tutor-note">내 실력을 매기는 등급이 아니라 튜터가 답하는 난이도입니다. 쉬운 대화는 짧고 익숙한 표현, 일상 대화는 이유와 경험, 표현 확장은 더 다양한 표현을 연습합니다. 자동으로 변경하지 않습니다.</p>
      </section>
      <section className="tutor-setting-section"><CompactToggle checked={tutor.data.profile.improvements} disabled={tutor.busy || !!tutor.pending} onChange={enabled => tutor.savePreferences(tutor.data.profile.level, enabled)} label="다른 표현도 함께 보기" /></section>
      {!!counts.length && <details className="tutor-setting-section"><summary>이전 교정 통계</summary>{counts.map(([type, count]) => <div className="tutor-stat-row" key={type}><span>{ERROR_LABELS[type] || type}</span><strong>{count}회</strong></div>)}<small className="tutor-note">이전 방식의 저장된 교정입니다. 자유 대화는 자동 채점하지 않습니다.</small></details>}
      <section className="tutor-setting-section"><h2>Mina · 대화와 기억</h2><p className="tutor-note">새 대화에도 같은 영어 튜터 역할과 내 학습 설정이 적용됩니다. 같은 대화를 다시 열면 저장된 내용을 이어서 이야기합니다. 새 대화는 별도이며 다른 세션이나 일상 기록을 자동으로 읽지 않습니다.</p></section>
      <section className="tutor-setting-section"><h2>내 사용량·개인정보</h2><TutorUsageSummary usage={tutor.data.usage} /><TutorUsageNote />
        <p className="tutor-note">하루 횟수·토큰 제한은 없습니다. 사용한 만큼 Hive API 사용료가 발생합니다. 관리자는 회원별 사용량을 확인할 수 있지만 대화 내용은 볼 수 없습니다. 다른 카테고리의 기록은 전송하지 않습니다.</p>
        <p className="tutor-note">AI 답변과 교정은 틀릴 수 있습니다. 음성은 원본 녹음 없이 인식된 문장만 저장합니다. 대화는 최대 200회까지 보관하며, 요청마다 같은 세션의 성공한 대화를 전달하므로 긴 대화일수록 토큰 사용량이 늘어납니다. 전송 한도에 도달하면 새 대화를 안내합니다.</p>
      </section>
    </section>}
  </main>;
}
