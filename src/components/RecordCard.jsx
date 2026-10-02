import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getInvestmentRecordType } from '../utils/recordUtils';
import CompactRecordContent from './CompactRecordContent';
import RecordSummaryContent from './RecordSummaryContent';

export default function RecordCard({ record, onOpen, onEdit, onDelete, onInvestmentSell, showCategory = true }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef(null);
  const menuPopoverRef = useRef(null);
  const showSellAction = record.category_id === 'investment' && getInvestmentRecordType(record.data || {}) === 'buy' && onInvestmentSell;
  const compact = ['video', 'workMeal', 'dining', 'delivery'].includes(record.category_id);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function closeOnOutsidePointer(event) {
      if (menuButtonRef.current?.contains(event.target) || menuPopoverRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    }
    function closeMenu() { setMenuOpen(false); }
    function closeOnEscape(event) { if (event.key === 'Escape') closeMenu(); }
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [menuOpen]);

  function toggleMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (menuOpen) { setMenuOpen(false); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 116;
    const menuHeight = (showSellAction ? 3 : 2) * 42 + 8;
    const openAbove = window.innerHeight - rect.bottom < menuHeight + 12;
    setMenuPosition({
      top: openAbove ? Math.max(8, rect.top - menuHeight - 6) : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 6),
      left: Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth)),
    });
    setMenuOpen(true);
  }
  function runMenuAction(action) { setMenuOpen(false); action(); }
  function stopActionKeys(event) { if (event.key !== 'Escape') event.stopPropagation(); }
  const actions = (
    <div className="record-actions"><div className="record-menu">
      <button ref={menuButtonRef} type="button" className="record-menu-trigger" aria-label="기록 메뉴" title="기록 메뉴"
        aria-haspopup="menu" aria-expanded={menuOpen} onClick={toggleMenu}
        onPointerDown={(event) => event.stopPropagation()} onKeyDown={stopActionKeys}>...</button>
    </div></div>
  );
  return (
    <article className={`record-card is-presented-record${compact ? ' is-compact-record' : ''}`} role="button" tabIndex={0}
      onClick={(event) => onOpen?.(record, event.currentTarget)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen?.(record, event.currentTarget); }
      }}>
      {compact ? <CompactRecordContent record={record} actions={actions} showCategory={showCategory} />
        : <RecordSummaryContent record={record} actions={actions} showCategory={showCategory} />}
      {menuOpen && createPortal(
        <div ref={menuPopoverRef} className="record-menu-popover" role="menu" style={menuPosition}
          onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={stopActionKeys}>
          {showSellAction && <button type="button" role="menuitem" onClick={() => runMenuAction(() => onInvestmentSell(record))}>매도 기록</button>}
          <button type="button" role="menuitem" onClick={() => runMenuAction(() => onEdit(record))}>수정</button>
          <button type="button" role="menuitem" className="danger" onClick={() => runMenuAction(() => onDelete(record))}>삭제</button>
        </div>, document.body,
      )}
    </article>
  );
}
