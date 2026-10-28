import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookmarkPlus, Check, Lightbulb, Volume2, Mic, Square, BookOpen, Trash2 } from 'lucide-react';
import { expressionFromTurn } from '../../supabase/functions/english-tutor/lessons.mjs';
import JapanesePhrase from './JapanesePhrase';
import './TutorStudy.css';

function Phrase({ phrase, language, onSpeak }) {
  if (language === 'ja') return <JapanesePhrase phrase={phrase} onSpeak={onSpeak} />;
  return <div className="study-phrase"><p lang="en">{phrase.sentence}</p>{phrase.meaning_ko && <p className="study-meaning">{phrase.meaning_ko}</p>}
    {onSpeak && <button type="button" className="tutor-icon" title="표현 듣기" aria-label="표현 듣기" onClick={() => onSpeak(phrase.sentence)}><Volume2 size={18} /></button>}</div>;
}

export function TutorLesson({ userId, language, lesson, draft, onDraftChange, onSpeak, onPractice, listening, speechBusy, supported, onStop, onStart, onClose, busy, study }) {
  const key = `goodlife-study-step-${userId}-${language}-${lesson.id}`;
  const [step, setStep] = useState(() => { try { return sessionStorage.getItem(key) === '1' ? 1 : 0; } catch { return 0; } });
  const [index, setIndex] = useState(0);
  const phrase = lesson.phrases[index];
  function changeStep(value) { onStop?.(); setStep(value); try { sessionStorage.setItem(key, String(value)); } catch { /* Optional resume. */ } }
  return <section className="tutor-lesson" aria-label={`${lesson.title} 단계별 연습`}>
    <header><button type="button" className="tutor-icon" aria-label="주제 목록으로" title="주제 목록으로" disabled={busy || speechBusy} onClick={onClose}><ArrowLeft size={18} /></button><div><h2>{lesson.title}</h2><p>{lesson.goal}</p></div><span>약 5분</span></header>
    <div className="study-steps" aria-label="학습 단계">{['표현 익히기', '따라 말하기'].map((label, i) => <button type="button" key={label} aria-pressed={step === i} disabled={busy || speechBusy} onClick={() => changeStep(i)}>{i + 1}. {label}</button>)}<span>3. 짧은 대화</span></div>
    <div className="study-expression"><div className="study-expression-count"><span>표현 {index + 1} / {lesson.phrases.length}</span><button type="button" className="tutor-icon" title="복습에 저장" aria-label="연습 표현 저장" disabled={study.busy || study.saved(`lesson:${lesson.id}:${phrase.id}`)} onClick={() => study.save({ topicId: lesson.id, phraseId: phrase.id })}>{study.saved(`lesson:${lesson.id}:${phrase.id}`) ? <Check size={18} /> : <BookmarkPlus size={18} />}</button></div>
      <Phrase phrase={phrase} language={language} onSpeak={speechBusy ? null : onSpeak} />
      <div className="study-expression-nav"><button type="button" className="tutor-icon" aria-label="이전 표현" title="이전 표현" disabled={index === 0 || speechBusy} onClick={() => setIndex(index - 1)}><ArrowLeft size={18} /></button><span>{index + 1} / 3</span><button type="button" className="tutor-icon" aria-label="다음 표현" title="다음 표현" disabled={index === 2 || speechBusy} onClick={() => setIndex(index + 1)}><ArrowRight size={18} /></button></div>
    </div>
    {step === 1 && <div className="study-practice"><button type="button" className="tutor-voice-button" aria-pressed={listening} disabled={busy || !supported} onClick={() => speechBusy ? onStop?.() : onPractice(phrase)}>{speechBusy ? <Square size={18} /> : <Mic size={18} />}{listening ? '말하기 종료' : speechBusy ? '마이크 연결 취소' : supported ? '이 표현 따라 말하기' : '음성 입력 미지원'}</button>
      <label>내 연습 문장<textarea aria-label="내 연습 문장" value={draft.text} maxLength={1000} disabled={speechBusy} onChange={event => onDraftChange(current => ({ ...current, text: event.target.value }))} placeholder="직접 입력해도 좋아요" /></label>
      <small>연습 문장은 제출 전까지 AI에 보내지 않습니다. 음성 인식은 기기의 외부 서비스를 사용할 수 있습니다.</small>
    </div>}
    <StudyError study={study} />
    <footer>{step === 0 && <button type="button" className="secondary-button" disabled={speechBusy} onClick={() => changeStep(1)}>따라 말하기 <ArrowRight size={16} /></button>}<button type="button" className="primary-button" disabled={busy || speechBusy} onClick={() => onStart(lesson.id)}>{busy ? '대화 여는 중' : '이 주제로 대화 시작'}<ArrowRight size={16} /></button></footer>
  </section>;
}

export function TutorStudyTools({ lesson, turns, language, onSpeak, onUse, study, disabled, onReview }) {
  const [open, setOpen] = useState(null);
  useEffect(() => setOpen(null), [lesson?.id]);
  if (!lesson) return null;
  const count = turns.filter(turn => turn.state === 'completed').length;
  return <div className="tutor-study-tools">
    <div className="study-tools-row"><button type="button" aria-expanded={open === 'phrases'} onClick={() => setOpen(open === 'phrases' ? null : 'phrases')}><BookOpen size={15} />표현</button><button type="button" aria-expanded={open === 'hint'} onClick={() => setOpen(open === 'hint' ? null : 'hint')}><Lightbulb size={15} />힌트</button><span>대화 {Math.min(count, 3)} / 3</span>{count >= 3 && <button type="button" disabled={disabled} onClick={onReview}>복습으로 <ArrowRight size={14} /></button>}</div>
    {open === 'phrases' && <div className="study-tool-content">{lesson.phrases.map(phrase => <div className="study-tool-phrase" key={phrase.id}><button type="button" disabled={disabled} onClick={() => onUse(phrase.sentence)}><strong lang={language}>{phrase.sentence}</strong>{language === 'ja' && <small className="study-tool-reading">{phrase.pronunciation_ko}</small>}<small>{phrase.meaning_ko}</small></button>{onSpeak && <button type="button" className="tutor-icon" title="표현 듣기" aria-label="표현 듣기" disabled={disabled} onClick={() => onSpeak(phrase.sentence)}><Volume2 size={16} /></button>}<button type="button" className="tutor-icon" title="표현 저장" aria-label="표현 저장" disabled={study.busy || study.saved(`lesson:${lesson.id}:${phrase.id}`)} onClick={() => study.save({ topicId: lesson.id, phraseId: phrase.id })}>{study.saved(`lesson:${lesson.id}:${phrase.id}`) ? <Check size={16} /> : <BookmarkPlus size={16} />}</button></div>)}</div>}
    {open === 'hint' && <div className="study-tool-content"><p>{lesson.hints[Math.min(count, 2)]}</p><p className="tutor-note">{lesson.goal} · 이 주제의 기본 표현을 참고하거나 한국어로 먼저 적어도 좋아요.</p><button type="button" onClick={() => setOpen('phrases')}>예시 표현 보기</button></div>}
    <StudyError study={study} />
  </div>;
}

export function TutorSaveTurn({ turn, study }) {
  return <div className="study-turn-save">{['practice', 'reply'].filter(kind => {
    const sentence = expressionFromTurn(turn, kind)?.sentence;
    return sentence && sentence.length <= 2000;
  }).map(kind => {
    const saved = study.saved(`turn:${turn.id}:${kind}`);
    return <button type="button" key={kind} disabled={study.busy || saved} onClick={() => study.save({ turnId: turn.id, kind })}>{saved ? <Check size={14} /> : <BookmarkPlus size={14} />}{kind === 'practice' ? '추천 표현' : '튜터 문장'} {saved ? '저장됨' : '저장'}</button>;
  })}</div>;
}

export function StudyError({ study }) {
  return study.error ? <div className="study-error" role="alert"><span>{study.error}</span><button type="button" disabled={study.loading || study.busy} onClick={study.reload}>다시 확인</button></div> : null;
}

function ReviewCard({ item, language, onSpeak, study }) {
  const [revealed, setRevealed] = useState(false);
  return <article className="study-review-card"><header><span>{item.last_reviewed_at ? '다시 떠올리기' : '첫 복습'}</span><RemoveExpression item={item} study={study} /></header><p>{item.phrase.meaning_ko || item.phrase.explanation_ko || '표현을 확인하고 소리 내어 연습해 보세요.'}</p>
    {!revealed ? <button type="button" className="study-reveal" onClick={() => setRevealed(true)}>표현 확인</button> : <><Phrase phrase={item.phrase} language={language} onSpeak={onSpeak} /><div className="study-grades">{[['again', '다시 연습', '10분 뒤'], ['hard', '어려웠어요', '내일'], ['good', '기억나요', `${[1, 3, 7, 14, 30, 60][Math.min(item.repetitions, 5)]}일 뒤`]].map(([grade, label, when]) => <button type="button" key={grade} disabled={study.busy} onClick={() => study.grade(item.id, grade)}>{label}<small>{when}</small></button>)}</div></>}
  </article>;
}

function RemoveExpression({ item, study }) {
  return <button type="button" className="tutor-icon" title="저장한 표현 삭제" aria-label="저장한 표현 삭제" disabled={study.busy} onClick={() => { if (window.confirm('이 표현과 복습 일정을 삭제할까요? 원래 대화는 유지됩니다.')) study.remove(item.id); }}><Trash2 size={15} /></button>;
}

export function TutorStudyReview({ study, language, onSpeak }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const due = study.items.filter(item => Date.parse(item.due_at) <= now).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const upcoming = study.items.filter(item => Date.parse(item.due_at) > now).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  return <section className="tutor-study-review" aria-label="표현 복습 일정"><header><h2>오늘 다시 말할 표현</h2><span>{due.length}개</span></header><StudyError study={study} />
    {study.loading && <p role="status">복습 일정 불러오는 중…</p>}
    {!study.loading && !study.error && !due.length && <p className="tutor-note">{study.items.length ? '지금 복습할 표현을 모두 확인했어요.' : '연습이나 대화에서 표현을 저장하면 여기서 복습할 수 있어요.'}</p>}
    {due.slice(0, 10).map(item => <ReviewCard key={`${item.id}-${item.last_reviewed_at}`} item={item} language={language} onSpeak={onSpeak} study={study} />)}
    {due.length > 10 && <p className="tutor-note">지금 보이는 10개를 마치면 다음 표현이 이어집니다.</p>}
    {!!upcoming.length && <details className="study-upcoming"><summary>다음 복습 {upcoming.length}개</summary>{upcoming.map(item => <div className="study-scheduled-row" key={item.id}><div><p lang={language}>{item.phrase.sentence}</p><time>{new Date(item.due_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div><RemoveExpression item={item} study={study} /></div>)}</details>}
  </section>;
}
