import { CATEGORIES, CATEGORY_ICONS, FINANCE_MODES } from '../data/categoryDefinitions';
import { useEffect, useState } from 'react';
import AdminUserList from './AdminUserList';
import CompactToggle from './ui/CompactToggle';

export default function SettingsScreen({
  profile,
  settings,
  records = [],
  isOwner = false,
  onSaveSettings,
  onUpdateProfile,
  onSignOut,
  onBack,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [profileName, setProfileName] = useState(profile?.display_name || '');
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setProfileName(profile?.display_name || '');
  }, [profile?.display_name]);

  const countByCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category.id, records.filter((record) => record.category_id === category.id).length]),
  );

  const displayedCategoryOrder = settings.sort_by_record_count
    ? [...settings.category_order].sort((a, b) => {
      const orderIndex = Object.fromEntries(settings.category_order.map((id, index) => [id, index]));
      return (countByCategory[b] || 0) - (countByCategory[a] || 0) || orderIndex[a] - orderIndex[b];
    })
    : settings.category_order;

  function toggleSortByRecordCount() {
    const orderIndex = Object.fromEntries(settings.category_order.map((id, index) => [id, index]));
    const sortedOrder = [...settings.category_order].sort((a, b) =>
      (countByCategory[b] || 0) - (countByCategory[a] || 0) || orderIndex[a] - orderIndex[b],
    );
    const nextEnabled = !settings.sort_by_record_count;
    onSaveSettings({
      ...settings,
      sort_by_record_count: nextEnabled,
      category_order: nextEnabled ? sortedOrder : settings.category_order,
    });
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

  async function saveProfileName() {
    const nextName = profileName.trim() || '사용자';
    setProfileSaving(true);
    try {
      await onUpdateProfile({ display_name: nextName });
      setProfileName(nextName);
    } finally {
      setProfileSaving(false);
    }
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
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            onCompositionEnd={(event) => setProfileName(event.currentTarget.value)}
            autoComplete="name"
          />
        </label>
        <button className="primary-button compact" type="button" onClick={saveProfileName} disabled={profileSaving}>
          {profileSaving ? '저장 중' : '이름 저장'}
        </button>
        <button className="secondary-button" onClick={onSignOut}>로그아웃</button>
      </section>

      <section className="settings-panel">
        <div className="section-title">
          <div>
            <h2>카테고리 표시와 집계</h2>
            <p className="muted">기록 수 기준 자동정렬을 켜면 많이 쓰는 카테고리가 홈에서 먼저 보입니다.</p>
          </div>
        </div>
        <CompactToggle
          checked={Boolean(settings.sort_by_record_count)}
          onChange={toggleSortByRecordCount}
          label={`기록순 정렬 ${settings.sort_by_record_count ? '켜짐' : '꺼짐'}`}
          className="wide-toggle"
        />

        <div className="category-settings-list">
          {displayedCategoryOrder.map((categoryId) => {
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
        <h2>한국투자 API</h2>
        <p className="muted">연동 준비중입니다. APP KEY와 APP SECRET은 브라우저에 저장하지 않고 Supabase Edge Function secret으로만 다루는 구조를 사용합니다.</p>
      </section>

      <AdminUserList enabled={isOwner} />

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
