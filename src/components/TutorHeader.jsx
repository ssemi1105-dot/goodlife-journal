import { useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, MessagesSquare, X } from 'lucide-react';

export default function TutorHeader({ title, subtitle, onBack, ready, tab, tabs, onTabChange, onOpenMenu, onChooseTopic, topicsOpen = false, topicDisabled = false, historyFirst = false, children }) {
  const dialog = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => { dialog.current?.close(); setMenuOpen(false); };
  const currentTab = tabs.find(([id]) => id === tab)?.[1];
  return <>
    <header className="tutor-header">
      <button type="button" className="tutor-icon" title="뒤로" aria-label="뒤로" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button>
      <div className="tutor-header-copy"><h1>{title}</h1><span>{tab === 'chat' ? subtitle : currentTab}</span></div>
      {ready && tab === 'chat' && onChooseTopic && <button type="button" className="tutor-topic-trigger" aria-expanded={topicsOpen} disabled={topicDisabled} onClick={onChooseTopic}>
        <MessagesSquare size={14} aria-hidden="true" /><span>주제 변경</span>
      </button>}
      {ready && <button type="button" className="tutor-icon tutor-menu-trigger" title={historyFirst ? '대화 기록과 학습 메뉴' : '학습 메뉴'} aria-label="학습 메뉴" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => { onOpenMenu(); dialog.current.showModal(); setMenuOpen(true); }}><Ellipsis size={22} aria-hidden="true" /></button>}
    </header>
    <dialog ref={dialog} className={`tutor-menu${historyFirst ? ' tutor-history-menu' : ''}`} aria-label="학습 메뉴" onClose={() => setMenuOpen(false)} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <header><h2>{historyFirst ? '대화 기록' : '학습 메뉴'}</h2><button type="button" className="tutor-icon" title="닫기" aria-label="학습 메뉴 닫기" onClick={close}><X size={18} aria-hidden="true" /></button></header>
      <div className="tutor-menu-profile">{subtitle}</div>
      {ready && historyFirst && children(close)}
      <div className="tutor-tabs" role="tablist" aria-label={title}>
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { onTabChange(id); close(); }}>{label}</button>)}
      </div>
      {ready && !historyFirst && <section className="tutor-menu-sessions"><h3>대화 기록</h3>{children(close)}</section>}
    </dialog>
  </>;
}
