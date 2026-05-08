import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_ICONS, FINANCE_MODES } from '../data/categoryDefinitions';
import { useSharing } from '../hooks/useSharing';
import AdminUserList from './AdminUserList';
import ShareSettingsPanel from './ShareSettingsPanel';
import CompactToggle from './ui/CompactToggle';

export default function SettingsScreen({
  userId,
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
  const [sharingSavingCategory, setSharingSavingCategory] = useState('');
  const sharing = useSharing(userId, CATEGORIES);

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

  async function setCategorySharing(categoryId, checked) {
    setSharingSavingCategory(categoryId);
    try {
      await sharing.setCategoryShared(categoryId, checked);
    } catch (error) {
      window.alert(error.message || '공유 설정 저장에 실패했습니다. Supabase 설정을 확인해 주세요.');
    } finally {
      setSharingSavingCategory('');
    }
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
  const selectedShared = selectedCategory ? Boolean(sharing.shareSettings[selectedCategory.id]?.is_shared) : false;

  return (
    <main className="screen settings-screen">
      <header className="sub-header modern-sub-header">
        <button className="icon-button" onClick={onBack} aria-label="뒤로">‹</button>
        <div>
          <p className="eyebrow">Settings</p>
          <h1>설정</h1>
        </div>
      </header>

      <section className="settings-panel profile-panel">
        <div className="section-title compact-section-title">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>내 프로필</h2>
          </div>
          <span>{profile?.role || 'member'}</span>
        </div>
        <label className="field compact-field">
          <span>이름</span>
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            autoComplete="name"
            placeholder="표시 이름"
          />
        </label>
        <div className="settings-actions-row">
          <button className="primary-button compact" type="button" onClick={saveProfileName} disabled={profileSaving}>
            {profileSaving ? '저장 중' : '저장'}
          </button>
          <button className="secondary-button compact" type="button" onClick={onSignOut}>로그아웃</button>
        </div>
      </section>

      <ShareSettingsPanel sharing={sharing} />

      <section className="settings-panel">
        <div className="section-title compact-section-title">
          <div>
            <p className="eyebrow">Categories</p>
            <h2>카테고리 설정</h2>
          </div>
          <CompactToggle
            checked={Boolean(settings.sort_by_record_count)}
            onChange={toggleSortByRecordCount}
            label="기록순"
          />
        </div>

        <div className="category-settings-list compact-category-list">
          {displayedCategoryOrder.map((categoryId) => {
            const category = CATEGORIES.find((item) => item.id === categoryId);
            if (!category) return null;
            const hidden = settings.hidden_categories.includes(category.id);
            return (
              <button
                type="button"
                className={hidden ? 'category-setting-card is-hidden' : 'category-setting-card'}
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
              >
                <div className="category-setting-head">
                  <span className="tile-icon" style={{ background: `${category.color}16`, color: category.color }}>{CATEGORY_ICONS[category.id]}</span>
                  <div>
                    <strong>{category.label}</strong>
                    <small>
                      {countByCategory[category.id] || 0}개 · {hidden ? '숨김' : '표시'} · {FINANCE_MODES[settings.finance_modes[category.id] || 'excluded']}
                      {sharing.shareSettings[category.id]?.is_shared ? ' · 공유' : ''}
                    </small>
                  </div>
                </div>
                <span className="row-chevron">›</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-panel integration-panel">
        <div className="section-title compact-section-title">
          <div>
            <p className="eyebrow">Integrations</p>
            <h2>데이터/연동</h2>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>한국투자 API</strong>
            <span>키와 토큰은 브라우저가 아니라 Supabase Edge Function secret으로만 다루도록 준비되어 있습니다.</span>
          </div>
        </div>
      </section>

      <AdminUserList enabled={isOwner} />

      {selectedCategory && (
        <div className="modal-backdrop">
          <section className="category-option-modal bottom-sheet">
            <header className="modal-header">
              <div className="category-setting-head">
                <span className="tile-icon" style={{ background: `${selectedCategory.color}16`, color: selectedCategory.color }}>
                  {CATEGORY_ICONS[selectedCategory.id]}
                </span>
                <div>
                  <p className="eyebrow">Category</p>
                  <h2>{selectedCategory.label}</h2>
                </div>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedCategoryId(null)} aria-label="닫기">×</button>
            </header>

            <div className="category-option-group">
              <CompactToggle
                checked={!selectedHidden}
                onChange={() => toggleHidden(selectedCategory.id)}
                label={selectedHidden ? '홈에서 숨김' : '홈에 표시'}
              />
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

            <div className="category-option-group">
              <CompactToggle
                checked={selectedShared}
                onChange={(checked) => setCategorySharing(selectedCategory.id, checked)}
                disabled={sharingSavingCategory === selectedCategory.id}
                label={selectedShared ? '공유 ON' : '공유 OFF'}
              />
              <p className="muted compact-help">
                친구 관계이고 서로 공유를 켠 경우에만 비교에 사용됩니다.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
