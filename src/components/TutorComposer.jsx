import { LoaderCircle, Mic, SendHorizontal, Square } from 'lucide-react';

export default function TutorComposer({ id, inputRef, draft, onDraftChange, onSubmit, busy, pending, listening, supported, onVoice, onStop,
  language, onLanguageChange, languages, languageLabel, submitLabel, placeholder, hidden, children }) {
  const locked = busy || pending || listening;
  const needsConfirmation = draft.mode === 'voice' && !draft.confirmed;
  return <form className="tutor-composer" onSubmit={onSubmit} hidden={hidden}>
    {children}
    <div className="tutor-composer-meta">
      <label className="tutor-input-label" htmlFor={id}>{draft.mode === 'voice' ? '인식된 문장' : '내 답변'}</label>
      {supported && <select aria-label={languageLabel} value={language} disabled={locked} onChange={event => onLanguageChange(event.target.value)}>{languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
      <span className="tutor-character-count">{draft.text.length}/1,000</span>
      {onStop && <button type="button" className="tutor-icon tutor-stop-audio" title="음성 재생 정지" aria-label="음성 재생 정지" onClick={onStop}><Square size={13} aria-hidden="true" /></button>}
    </div>
    <div className="tutor-input-row"><textarea id={id} ref={inputRef} value={draft.text} maxLength={1000} rows={2} disabled={locked} placeholder={placeholder} onChange={event => onDraftChange(current => ({ ...current, text: event.target.value }))} /></div>
    {draft.mode === 'voice' && <label className="tutor-voice-confirm"><input type="checkbox" checked={draft.confirmed} disabled={locked} onChange={event => onDraftChange(current => ({ ...current, confirmed: event.target.checked }))} />인식된 문장을 확인했습니다</label>}
    {!supported && <small className="tutor-voice-unavailable">음성 입력 미지원 브라우저입니다. 직접 입력할 수 있어요.</small>}
    <div className="tutor-action-row">
      <button type="button" className="tutor-voice-button" disabled={busy || pending || !supported} aria-pressed={listening} onClick={onVoice}>
        {listening ? <Square size={19} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}<span>{listening ? '말하기 종료' : '말하기'}</span>
      </button>
      <button type="submit" className="tutor-send" aria-label={submitLabel} disabled={locked || !draft.text.trim() || needsConfirmation}>
        {busy ? <LoaderCircle size={19} className="tutor-loading-icon" aria-hidden="true" /> : <SendHorizontal size={19} aria-hidden="true" />}<span>{busy ? '답변 대기' : '제출하기'}</span>
      </button>
    </div>
  </form>;
}
