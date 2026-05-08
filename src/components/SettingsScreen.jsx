import { CATEGORIES, CATEGORY_ICONS, FINANCE_MODES } from '../data/categoryDefinitions';
import { useRef, useState } from 'react';

export default function SettingsScreen({
  profile,
  settings,
  records = [],
  onSaveSettings,
  onUpdateProfile,
  onSignOut,
  onBack,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const dragRef = useRef({ index: null, startY: 0, lastY: 0 });

  const countByCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category.id, records.filter((record) => record.category_id === category.id).length]),
  );

  function moveCategory(index, direction) {
    const next = [...settings.category_order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onSaveSettings({ ...settings, category_order: next });
  }

  function sortByRecordCount() {
    const orderIndex = Object.fromEntries(settings.category_order.map((id, index) => [id, index]));
    const next = [...settings.category_order].sort((a, b) =>
      (countByCategory[b] || 0) - (countByCategory[a] || 0) || orderIndex[a] - orderIndex[b],
    );
    onSaveSettings({ ...settings, category_order: next });
  }

  function toggleHidden(categoryId) {
    const hidden = settings.hidden_categories.includes(categoryId)
      ? settings.hidden_categories.filter((id) => id !== categoryId)
      : [...settings.hidden_categories, categoryId];
    onSaveSettings({ ...settings, hidden_categories: hidden });
  }

  function setFinanceMode(categoryId, mode) {
    onSaveSettings({
      ...settings,
      finance_modes: { ...settings.finance_modes, [categoryId]: mode },
    });
  }

  function startDrag(event, index) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { index, startY: event.clientY, lastY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function dragMove(event) {
    const drag = dragRef.current;
    if (drag.index === null) return;
    event.preventDefault();
    event.stopPropagation();

    const delta = event.clientY - drag.lastY;
    if (Math.abs(delta) < 42) return;

    const direction = delta > 0 ? 1 : -1;
    const target = drag.index + direction;
    if (target < 0 || target >= settings.category_order.length) return;

    const next = [...settings.category_order];
    [next[drag.index], next[target]] = [next[target], next[drag.index]];
    dragRef.current = { ...drag, index: target, lastY: event.clientY };
    onSaveSettings({ ...settings, category_order: next });
  }

  function endDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { index: null, startY: 0, lastY: 0 };
  }

  const selectedCategory = CATEGORIES.find((category) => category.id === selectedCategoryId);
  const selectedHidden = selectedCategory ? settings.hidden_categories.includes(selectedCategory.id) : false;

  return (
    <main className="screen">
      <header className="sub-header">
        <button className="icon-button" onClick={onBack} aria-label="뒤로">‹</button>
        <div>
          <p className="eyebrow">Settings</p>
          <h1>설정</h1>
        </div>
      </header>

      <section className="settings-panel">
        <h2>프로필</h2>
        <label className="field">
          <span>이름</span>
          <input
            value={profile?.display_name || ''}
            onChange={(event) => onUpdateProfile({ display_name: event.target.value })}
          />
        </label>
        <button className="secondary-button" onClick={onSignOut}>로그아웃</button>
      </section>

      <section className="settings-panel">
        <div className="section-title">
          <div>
            <h2>카테고리 표시와 집계</h2>
            <p className="muted">홈은 기본적으로 기록 수가 많은 카테고리부터 보여줍니다. 아래 순서는 같은 기록 수일 때의 기준이 됩니다.</p>
          </div>
        </div>
        <button className="secondary-button" onClick={sortByRecordCount}>기록 많은 순으로 정렬</button>

        <div className="category-settings-list">
          {settings.category_order.map((categoryId, index) => {
            const category = CATEGORIES.find((item) => item.id === categoryId);
            if (!category) return null;
            const hidden = settings.hidden_categories.includes(category.id);
            return (
              <article
                className={hidden ? 'category-setting-card is-hidden' : 'category-setting-card'}
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
              >
                <div className="category-setting-head">
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`${category.label} 순서 변경`}
                    onPointerDown={(event) => startDrag(event, index)}
                    onPointerMove={dragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    ☰
                  </button>
                  <span className="tile-icon" style={{ background: `${category.color}18`, color: category.color }}>{CATEGORY_ICONS[category.id]}</span>
                  <div>
                    <strong>{category.label}</strong>
                    <small>
                      {countByCategory[category.id] || 0}개 기록 · {hidden ? '숨김' : '표시 중'} · {FINANCE_MODES[settings.finance_modes[category.id] || 'excluded']}
                    </small>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="settings-panel">
        <h2>공유 기능 준비</h2>
        <p className="muted">현재 버전은 개인 기록 중심입니다. DB에는 공유 권한 구조를 미리 넣어 두어, 이후 친구와 기록 비교, 카테고리별 상위 비율, 작품/장소별 평점 비교 기능을 붙일 수 있습니다.</p>
      </section>

      {selectedCategory && (
        <div className="modal-backdrop">
          <section className="category-option-modal">
            <header className="modal-header">
              <div className="category-setting-head">
                <span className="tile-icon" style={{ background: `${selectedCategory.color}18`, color: selectedCategory.color }}>
                  {CATEGORY_ICONS[selectedCategory.id]}
                </span>
                <div>
                  <p className="eyebrow">Category Settings</p>
                  <h2>{selectedCategory.label}</h2>
                </div>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedCategoryId(null)} aria-label="닫기">×</button>
            </header>

            <div className="category-option-group">
              <span>표시 여부</span>
              <button type="button" className="option-wide-button" onClick={() => toggleHidden(selectedCategory.id)}>
                {selectedHidden ? '홈에 보이기' : '홈에서 숨기기'}
              </button>
            </div>

            <div className="category-option-group">
              <span>메인 집계</span>
              <div className="option-segment-grid">
                {Object.entries(FINANCE_MODES).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    className={(settings.finance_modes[selectedCategory.id] || 'excluded') === mode ? 'is-selected' : ''}
                    onClick={() => setFinanceMode(selectedCategory.id, mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
