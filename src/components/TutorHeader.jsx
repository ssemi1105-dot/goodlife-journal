import { useRef } from 'react';
import { ArrowLeft, Ellipsis, X } from 'lucide-react';

export default function TutorHeader({ title, subtitle, onBack, ready, tab, tabs, onTabChange, onOpenMenu, children }) {
  const dialog = useRef(null);
  const close = () => dialog.current?.close();
  const currentTab = tabs.find(([id]) => id === tab)?.[1];
  return <>
    <header className="tutor-header">
      <button type="button" className="tutor-icon" title="뒤로" aria-label="뒤로" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button>
      <div className="tutor-header-copy"><h1>{title}</h1><span>{tab === 'chat' ? subtitle : currentTab}</span></div>
      {ready && <button type="button" className="tutor-icon tutor-menu-trigger" title="학습 메뉴" aria-label="학습 메뉴" aria-haspopup="dialog" onClick={() => { onOpenMenu(); dialog.current.showModal(); }}><Ellipsis size={22} aria-hidden="true" /></button>}
    </header>
    <dialog ref={dialog} className="tutor-menu" aria-label="학습 메뉴" onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <header><h2>학습 메뉴</h2><button type="button" className="tutor-icon" title="닫기" aria-label="학습 메뉴 닫기" onClick={close}><X size={18} aria-hidden="true" /></button></header>
      <div className="tutor-menu-profile">{subtitle}</div>
      <div className="tutor-tabs" role="tablist" aria-label={title}>
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { onTabChange(id); close(); }}>{label}</button>)}
      </div>
      {ready && <section className="tutor-menu-sessions"><h3>대화 기록</h3>{children(close)}</section>}
    </dialog>
  </>;
}
