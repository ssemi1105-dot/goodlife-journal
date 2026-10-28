import { Check, MessageCircle, Plus, Trash2 } from 'lucide-react';

function lastDate(session) {
  return new Date(session.last_message_at || session.updated_at || session.created_at).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TutorSessionHistory({ sessions, selectedId, disabled, error, onSelect, onCreate, onDelete }) {
  return <div className="tutor-history">
    <button type="button" className="tutor-history-new" disabled={disabled} onClick={onCreate}><Plus size={18} aria-hidden="true" />새 대화</button>
    {error && <p className="tutor-history-error" role="alert">{error}</p>}
    {!sessions.length && <p className="tutor-history-empty">아직 보낸 대화가 없어요.</p>}
    <ul className="tutor-history-list" aria-label="저장된 대화">
      {sessions.map(session => <li key={session.id}>
        <button type="button" className="tutor-history-select" aria-current={selectedId === session.id ? 'true' : undefined} disabled={disabled} onClick={() => onSelect(session.id)}>
          <MessageCircle size={17} aria-hidden="true" />
          <span className="tutor-history-copy"><strong>{session.title}</strong>
            {session.preview && session.preview !== session.title && <span>{session.preview}</span>}
            <time dateTime={session.last_message_at || session.updated_at || session.created_at}>{lastDate(session)}</time>
          </span>
          {selectedId === session.id && <Check size={16} aria-label="현재 대화" />}
        </button>
        <button type="button" className="tutor-icon tutor-history-delete" aria-label={`${session.title} 대화 삭제`} title="대화 삭제" disabled={disabled} onClick={() => onDelete(session.id)}><Trash2 size={16} aria-hidden="true" /></button>
      </li>)}
    </ul>
  </div>;
}
