import { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getCategoryNavigation } from '../utils/categoryNavigation';
import CategoryIcon from './ui/CategoryIcon';

export default function CategoryBrowser({ mode = 'all', settings, records, onClose, onOpenCategory, onManage, onOpenTutor, japaneseTutorUrl }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const headingId = useId();
  const navigation = useMemo(() => getCategoryNavigation(records, settings), [records, settings]);
  const frequent = mode === 'frequent';
  const items = frequent ? navigation.frequent : navigation.all;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const app = document.querySelector('.app-shell');
    const previousInert = app?.inert;
    if (app) app.inert = true;
    dialogRef.current?.querySelector('button')?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (app) app.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<div className="journal-ui category-browser-backdrop" onClick={event => {
    if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <section ref={dialogRef} className="category-browser" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header className="category-browser-header"><div><h2 id={headingId}>{frequent ? '자주 사용한 카테고리' : '전체 카테고리'}</h2><p>{frequent ? '기록 많은 순' : `${items.length}개 카테고리`}</p></div>
        <button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={21} /></button></header>
      <div className="category-browser-scroll">
        <div className="category-browser-grid">
          {items.map(({ category, count, hidden }) => <button type="button" className="category-browser-card" key={category.id} data-category-id={category.id} onClick={() => onOpenCategory(category.id, null)}>
            <CategoryIcon categoryId={category.id} /><strong>{category.label}</strong><small>{count}건{hidden ? ' · 홈 숨김' : ''}</small>
          </button>)}
          {!frequent && onOpenTutor && <button type="button" className="category-browser-card" onClick={onOpenTutor}><CategoryIcon categoryId="english-tutor" /><strong>영어 튜터</strong><small>Mina</small></button>}
          {!frequent && japaneseTutorUrl && <a className="category-browser-card" href={japaneseTutorUrl} target="_blank" rel="noopener noreferrer" aria-label="일본어 튜터 · 미캉 (새 탭)" title="미캉 일본어 학습 (새 탭)"><CategoryIcon categoryId="japanese-tutor" /><strong>일본어 튜터</strong><small>미캉 · 새 탭</small></a>}
        </div>
        {!items.length && <p className="empty-text">아직 기록한 카테고리가 없습니다.</p>}
      </div>
      {onManage && <footer><button type="button" className="secondary-button compact" onClick={onManage}>카테고리 설정</button></footer>}
    </section>
  </div>, document.body);
}
