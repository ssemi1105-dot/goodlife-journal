import { TUTOR_TOPICS } from '../../supabase/functions/english-tutor/topics.mjs';

export default function TutorTopics({ disabled, onSelect, onFree, onClose }) {
  return <section className="tutor-topic-picker" aria-label="대화 주제 선택">
    <header><h2>어떤 이야기를 할까요?</h2>
      {onClose && <button type="button" className="tutor-icon" onClick={onClose} disabled={disabled} aria-label="주제 선택 닫기" title="닫기">×</button>}
    </header>
    <div className="tutor-topic-grid">
      {TUTOR_TOPICS.map(topic => <button type="button" key={topic.id} disabled={disabled} onClick={() => onSelect(topic.id)} aria-label={`${topic.label} 주제 시작`}>
        <strong>{topic.label}</strong><span>{topic.situation}</span>
      </button>)}
    </div>
    <button type="button" className="tutor-free-chat" disabled={disabled} onClick={onFree}>자유 대화</button>
  </section>;
}
