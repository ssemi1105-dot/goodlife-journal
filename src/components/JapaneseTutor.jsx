import { useEffect, useRef, useState } from 'react';
import { useTutor } from '../hooks/useEnglishTutor';
import { useJapaneseSpeech } from '../hooks/useJapaneseSpeech';
import { callJapaneseTutor, tutorErrorMessage } from '../services/tutorClient';
import { JAPANESE_TOPICS, LEVELS, LEVEL_LABELS } from '../../supabase/functions/japanese-tutor/topics.mjs';
import JapanesePhrase from './JapanesePhrase';
import JapaneseFeedback from './JapaneseFeedback';
import TutorUsageSummary, { TutorUsageNote } from './TutorUsageSummary';
import TutorHeader from './TutorHeader';
import TutorComposer from './TutorComposer';
import { useTutorStudy } from '../hooks/useTutorStudy';
import { getStudyLesson } from '../../supabase/functions/english-tutor/lessons.mjs';
import { TutorLesson, TutorStudyTools, TutorStudyReview, TutorSaveTurn, StudyError } from './TutorStudy';
import './EnglishTutor.css';
import './JapaneseTutor.css';

const emptyDraft = () => ({ text: '', mode: 'text', confirmed: false });
function readDraft(key) { try { const value = JSON.parse(sessionStorage.getItem(key)); return value && typeof value.text === 'string' ? value : emptyDraft(); } catch { return emptyDraft(); } }

export default function JapaneseTutor({ userId, onBack }) {
  const tutor = useTutor(userId, { call: callJapaneseTutor, storagePrefix: 'goodlife-japanese-tutor' });
  const study = useTutorStudy(userId, 'ja', callJapaneseTutor, !!tutor.data && !tutor.loading);
  const [lessonSelection, setLessonSelection] = useState(null);
  const [tab, setTab] = useState('chat'), [choosing, setChoosing] = useState(false), [practicePhrase, setPracticePhrase] = useState(null);
  const [language, setLanguage] = useState('ja-JP'), [speed, setSpeed] = useState(.8);
  const key = `goodlife-japanese-tutor-draft-${userId}`;
  const [draft, setDraft] = useState(() => readDraft(key));
  const scroll = useRef(null), input = useRef(null);
  const speech = useJapaneseSpeech(text => setDraft(current => ({ text: `${current.text}${current.text ? ' ' : ''}${text}`.slice(0, 1000), mode: 'voice', confirmed: false })));
  const [height, setHeight] = useState(() => window.visualViewport?.height || window.innerHeight);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* In-memory input stays available. */ } }, [key, draft]);
  useEffect(() => {
    const update = () => setHeight(window.visualViewport?.height || window.innerHeight);
    window.visualViewport?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { window.visualViewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => {
    const area = scroll.current;
    if (!area || tab !== 'chat') return;
    if (choosing || !tutor.turns.length) { area.scrollTop = 0; return; }
    const target = area.querySelector('.tutor-turn:last-of-type .japanese-feedback');
    if (target) area.scrollTop += target.getBoundingClientRect().top - area.getBoundingClientRect().top;
  }, [tutor.turns.length, tutor.busy, tutor.loading, tutor.session?.id, tab, choosing]);
  const locked = tutor.loading || tutor.busy || !!tutor.pending || speech.busy;
  const ready = !!tutor.data && !tutor.loading;
  const showTopics = choosing || !tutor.session;
  const speak = text => speech.speak(text, speed);
  function practice(phrase) {
    if (locked || (draft.text.trim() && !window.confirm('작성 중인 문장을 지우고 따라 말할까요?'))) return;
    speech.stop(); setTab('chat'); setChoosing(false); setPracticePhrase(phrase); setLanguage('ja-JP'); setDraft(emptyDraft());
    if (speech.supported) speech.start('ja-JP'); else input.current?.focus();
  }
  async function startTopic(id) {
    if (locked || (draft.text.trim() && !window.confirm('입력한 문장은 유지됩니다. 새 주제로 시작할까요?'))) return;
    speech.stop();
    if (await tutor.startTopic(id)) { setChoosing(false); setPracticePhrase(null); setLessonSelection(null); }
  }
  function clearSubmitted(content) { setDraft(current => current.text.trim() === content.trim() ? emptyDraft() : current); }
  async function send(event) {
    event.preventDefault();
    if (locked || !draft.text.trim() || (draft.mode === 'voice' && !draft.confirmed)) return;
    speech.stop();
    if (await tutor.send(draft.text, draft.mode, draft.confirmed)) { clearSubmitted(draft.text); setPracticePhrase(null); }
  }
  function changeTab(next) { speech.stop(); setTab(next); }
  function chooseTopic() {
    if (locked) return;
    speech.stop(); setTab('chat'); setChoosing(true); setLessonSelection(null);
  }
  function useExpression(text) {
    if (locked || (draft.text.trim() && !window.confirm('작성 중인 문장을 선택한 표현으로 바꿀까요?'))) return;
    setDraft({ text, mode: 'text', confirmed: false }); input.current?.focus();
  }
  function lessonPractice(phrase) {
    if (locked || (draft.text.trim() && !window.confirm('작성 중인 문장을 지우고 연습할까요?'))) return;
    setDraft(emptyDraft()); setPracticePhrase(phrase); setLanguage('ja-JP'); speech.start('ja-JP');
  }
  const activeLesson = tutor.session ? getStudyLesson('ja', tutor.session.topic_id || 'daily') : null;
  const review = tutor.data?.review || [];
  return <main className={`screen tutor-screen japanese-tutor ${window.innerHeight - height > 120 ? 'tutor-keyboard-open' : ''}`} style={{ '--tutor-height': `${height}px` }}>
    <TutorHeader title="일본어 튜터" subtitle={`Haru${tutor.data ? ` · ${LEVEL_LABELS[tutor.data.profile.level]}` : ''}`} onBack={onBack} ready={ready} tab={tab}
      onChooseTopic={chooseTopic} topicsOpen={showTopics} topicDisabled={locked}
      tabs={[[ 'chat', '말하기' ], ['review', '복습'], ['settings', '학습 설정']]} onTabChange={changeTab} onOpenMenu={speech.stop}>
      {close => <div className="tutor-session-bar"><select aria-label="일본어 대화 선택" value={tutor.session?.id || ''} disabled={locked} onChange={async event => { speech.stop(); if (await tutor.selectSession(event.target.value)) { setTab('chat'); setChoosing(false); setPracticePhrase(null); setLessonSelection(null); close(); } }}>
        {!tutor.session && <option value="">새 대화</option>}{tutor.data.sessions.map(session => <option key={session.id} value={session.id}>{session.title} · {new Date(session.created_at).toLocaleDateString('ko-KR')}</option>)}
      </select><button type="button" className="tutor-icon" title="새 주제" aria-label="일본어 새 주제" disabled={locked} onClick={() => { chooseTopic(); close(); }}>＋</button>
        <button type="button" className="tutor-icon" title="대화 삭제" aria-label="일본어 대화 삭제" disabled={locked || !tutor.session} onClick={async () => { if (window.confirm('이 일본어 대화와 교정 기록을 삭제할까요? 별도로 저장한 표현과 사용량은 유지됩니다.')) { speech.stop(); await tutor.deleteSession(tutor.session.id); close(); } }}>×</button></div>}
    </TutorHeader>
    {tutor.loading && <p className="tutor-state" role="status">학습 기록 불러오는 중…</p>}
    {tutor.error && <div className="tutor-error" role="alert"><span>{tutor.error}</span><button type="button" disabled={locked} onClick={() => tutor.reload()}>다시 확인</button></div>}
    {speech.error && <div className="tutor-error" role="alert"><span>{speech.error}</span><button type="button" disabled={locked || !speech.supported} onClick={() => speech.start(language)}>다시 말하기</button><button type="button" onClick={speech.clearError}>닫기</button></div>}
    {!tutor.data && !tutor.loading && <div className="tutor-state"><h2>아직 연결되지 않았어요</h2><p>관리자에게 일본어 튜터 사용 허가를 요청해 주세요. 최초 사용 시 서버 설정도 필요합니다.</p></div>}
    {ready && tab === 'chat' && <section className="tutor-chat" role="tabpanel" aria-label="일본어 말하기">
      <div className="tutor-conversation" ref={scroll} aria-label="일본어 대화 내역" aria-busy={tutor.busy}>
        {showTopics ? lessonSelection ? <TutorLesson key={lessonSelection.id} userId={userId} language="ja" lesson={lessonSelection} draft={draft} onDraftChange={setDraft} onSpeak={speak}
          onPractice={lessonPractice} listening={speech.listening} speechBusy={speech.busy} supported={speech.supported} onStop={speech.stop} onStart={startTopic} onClose={() => setLessonSelection(null)} busy={tutor.busy || !!tutor.pending} study={study} />
          : <section className="tutor-topic-picker"><header><h2>어떤 상황을 연습할까요?</h2>{tutor.session && <button type="button" className="tutor-icon" aria-label="주제 선택 닫기" title="닫기" disabled={locked} onClick={() => setChoosing(false)}>×</button>}</header>
          <div className="tutor-topic-grid">{JAPANESE_TOPICS.map(topic => <button type="button" key={topic.id} aria-label={`${topic.label} 일본어 시작`} disabled={locked} onClick={() => setLessonSelection(getStudyLesson('ja', topic.id))}><strong>{topic.label}</strong><span>{topic.situation}</span></button>)}</div>
          <p className="tutor-note">한글 발음은 근사치이며 장음·억양을 완전히 나타내지 못합니다. 일본어 음성도 함께 확인하세요.</p>
        </section> : <>
          {tutor.session?.opening && <section className="tutor-opening" aria-label="일본어 시작 질문"><span className="tutor-speaker">HARU · {tutor.session.title}</span>
            <JapanesePhrase phrase={tutor.session.opening.question_reading} onSpeak={speak} label="첫 질문" disabled={speech.busy} />
            <details className="japanese-example"><summary>대답이 막힐 때</summary><JapanesePhrase phrase={tutor.session.opening.example} label="대답 예시" onSpeak={speak} onPractice={practice} disabled={locked} /></details>
          </section>}
          {tutor.turns.map(turn => <article className="tutor-turn" key={turn.id}>
            <div className="tutor-user"><span>나 <time>{new Date(turn.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></span><p>{turn.content}</p></div>
            {turn.state === 'completed' && <><JapaneseFeedback feedback={turn.feedback} speak={speak} practice={practice} disabled={locked} /><TutorSaveTurn turn={turn} study={study} /></>}
            {turn.state === 'pending' && <p className="tutor-note" role="status">답변을 준비하고 있어요…</p>}
            {turn.state === 'failed' && <div className="tutor-failed"><p>{tutorErrorMessage(turn.error_code)}</p><button type="button" disabled={locked} onClick={() => { setDraft({ text: turn.content, mode: 'text', confirmed: false }); input.current?.focus(); }}>입력창으로 가져오기</button></div>}
          </article>)}
        </>}
        {tutor.busy && <p className="tutor-note" role="status">처리 중…</p>}
      </div>
      <TutorComposer id="japanese-message" inputRef={input} draft={draft} onDraftChange={setDraft} onSubmit={send} hidden={showTopics}
        busy={tutor.busy} pending={!!tutor.pending} listening={speech.listening} voiceStarting={speech.starting} voiceStopping={speech.stopping} supported={speech.supported} onVoice={() => speech.start(language)} onStop={speech.stop}
        language={language} onLanguageChange={setLanguage} languages={[[ 'ja-JP', '일본어' ], ['ko-KR', '한국어']]} languageLabel="말하기 언어" submitLabel="일본어 메시지 제출하기" placeholder="일본어 또는 한국어로 답해 보세요">
        {activeLesson ? <TutorStudyTools lesson={activeLesson} turns={tutor.turns} language="ja" onSpeak={speak} onUse={useExpression} study={study} disabled={locked} onReview={() => changeTab('review')} /> : <StudyError study={study} />}
        {practicePhrase && <div className="japanese-practice-target"><div><span>따라 말하기</span><button type="button" className="tutor-icon" title="연습 닫기" aria-label="연습 닫기" disabled={speech.busy} onClick={() => setPracticePhrase(null)}>×</button></div><p lang="ja">{practicePhrase.sentence}</p><small>{practicePhrase.pronunciation_ko}</small></div>}
        {tutor.pending && <div className="tutor-pending">이전 요청 확인이 필요합니다.<button type="button" disabled={tutor.busy} onClick={async () => { const text = tutor.pending.content; if (await tutor.resolvePending()) clearSubmitted(text); }}>저장 상태 확인</button></div>}
      </TutorComposer>
    </section>}
    {ready && tab === 'review' && <section className="tutor-scroll-panel" role="tabpanel" aria-label="일본어 복습"><TutorStudyReview study={study} language="ja" onSpeak={speak} />
      <details className="study-upcoming"><summary>대화에서 배운 표현 {review.length}건</summary><div className="tutor-review-heading"><h2>다시 말할 표현</h2><span>{review.filter(turn => !turn.reviewed_at).length}건 남음</span></div>
      {review.map(turn => <article className="tutor-review-item" key={turn.id}><JapaneseFeedback feedback={turn.feedback} speak={speak} practice={practice} disabled={locked} reply={false} /><TutorSaveTurn turn={turn} study={study} /><button type="button" aria-pressed={!!turn.reviewed_at} disabled={locked} onClick={() => tutor.markReviewed(turn.id, !turn.reviewed_at)}>{turn.reviewed_at ? '복습 완료 취소' : '복습 완료'}</button></article>)}
      {!review.length && <p className="tutor-state">아직 복습할 표현이 없습니다.</p>}<p className="tutor-note">최근 완료 대화 200회 기준</p>
      </details></section>}
    {ready && tab === 'settings' && <section className="tutor-scroll-panel" role="tabpanel" aria-label="일본어 학습 설정">
      <section className="tutor-setting-section"><h2>회화 수준</h2><div className="tutor-levels">{LEVELS.map(level => <button type="button" key={level} aria-pressed={tutor.data.profile.level === level} disabled={locked} onClick={() => tutor.savePreferences(level, false)}>{LEVEL_LABELS[level]}</button>)}</div><p className="tutor-note">시험 등급이 아닌 연습 난이도입니다. 영어 수준과 별도로 저장됩니다.</p></section>
      <section className="tutor-setting-section"><h2>듣기 속도</h2><div className="tutor-levels">{[[.65, '아주 천천히'], [.8, '천천히'], [1, '보통']].map(([rate, label]) => <button type="button" key={rate} aria-pressed={speed === rate} onClick={() => { speech.stop(); setSpeed(rate); }}>{label}</button>)}</div>{!speech.hasVoice && <p className="tutor-note">일본어 음성을 사용할 수 있는지 기기의 음성 설정을 확인해 주세요.</p>}</section>
      <section className="tutor-setting-section"><h2>내 일본어 사용량</h2><TutorUsageSummary usage={tutor.data.usage} /><TutorUsageNote /><p className="tutor-note">일일 제한 없이 사용량에 따라 Hive 비용이 발생합니다. 일본어 대화만 전송하며 영어 대화와 생활 기록은 보내지 않습니다. 관리자는 사용량만 확인합니다.</p></section>
      <section className="tutor-setting-section"><h2>음성·학습 안내</h2><p className="tutor-note">한글 발음은 보조 표기이며 정확한 일본어 발음·억양과 차이가 있습니다. AI의 읽기·번역·교정도 틀릴 수 있습니다. 음성은 브라우저 서비스에서 인식하며 앱은 녹음 파일을 저장하지 않습니다. 인식된 텍스트만으로 발음 점수를 평가하지 않습니다.</p></section>
    </section>}
  </main>;
}
