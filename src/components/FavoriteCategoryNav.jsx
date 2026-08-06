import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_ICONS, CATEGORY_MAP, getCategoryThemeStyle } from '../data/categoryDefinitions';

export default function FavoriteCategoryNav({ settings, onOpenCategory, onManage }) {
  const [open, setOpen] = useState(false);
  const favorites = useMemo(() => (
    (settings.favorite_categories || [])
      .map((id) => CATEGORY_MAP[id])
      .filter(Boolean)
      .filter((category) => !settings.hidden_categories.includes(category.id))
  ), [settings.favorite_categories, settings.hidden_categories]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  function openCategory(categoryId) {
    setOpen(false);
    onOpenCategory(categoryId, null);
  }

  return (
    <>
      <div className="favorite-nav-item">
        <button
          type="button"
          className="favorite-nav-trigger"
          aria-label="즐겨찾기 카테고리"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true">★</span>
        </button>
        <small>즐겨찾기</small>
      </div>

      {open && createPortal(
        <div className="favorite-category-backdrop" role="presentation" onPointerDown={() => setOpen(false)}>
          <section
            className="favorite-category-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="즐겨찾기 카테고리"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="favorite-sheet-handle" aria-hidden="true" />
            <header className="favorite-sheet-header">
              <div>
                <p className="eyebrow">Quick access</p>
                <h2>즐겨찾기</h2>
              </div>
              <button
                type="button"
                className="secondary-button compact"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
              >
                항목 편집
              </button>
            </header>

            {favorites.length > 0 ? (
              <div className="favorite-category-grid">
                {favorites.map((category) => (
                  <button
                    type="button"
                    className="favorite-category-button"
                    style={getCategoryThemeStyle(category.id)}
                    key={category.id}
                    onClick={() => openCategory(category.id)}
                  >
                    <span className="tile-icon">{CATEGORY_ICONS[category.id]}</span>
                    <strong>{category.label}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <div className="favorite-empty-state">
                <span aria-hidden="true">☆</span>
                <strong>아직 즐겨찾기가 없습니다</strong>
                <p>설정의 카테고리 항목을 눌러 즐겨찾기에 추가하세요.</p>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
