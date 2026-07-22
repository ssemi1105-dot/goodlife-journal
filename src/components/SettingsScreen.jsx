import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_ICONS, FINANCE_MODES, getCategoryThemeStyle } from '../data/categoryDefinitions';
import { useSharing } from '../hooks/useSharing';
import AdminUserList from './AdminUserList';
import ShareSettingsPanel from './ShareSettingsPanel';
import CompactToggle from './ui/CompactToggle';

const DEFAULT_SECTION_OPEN = {
  profile: true,
  sharing: false,
  categories: false,
  integrations: false,
  admin: false,
};

function getSectionStorageKey(userId) {
  return `goodlife-settings-sections-${userId || 'guest'}`;
}

function loadSectionState(userId) {
  if (typeof window === 'undefined') return DEFAULT_SECTION_OPEN;
  try {
    const saved = JSON.parse(window.localStorage.getItem(getSectionStorageKey(userId)) || '{}');
    return { ...DEFAULT_SECTION_OPEN, ...saved };
  } catch {
    return DEFAULT_SECTION_OPEN;
  }
}

function SettingsSection({ sectionId, eyebrow, title, summary, open, onToggle, action, className = '', children }) {
  return (
    <section className={`settings-panel collapsible-settings-section ${className} ${open ? 'is-open' : 'is-collapsed'}`}>
      <div className="settings-section-header">
        <button type="button" className="settings-section-toggle" onClick={() => onToggle(sectionId)} aria-expanded={open}>
          <span className="settings-section-chevron" aria-hidden="true">{open ? '⌄' : '›'}</span>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          {summary && <small>{summary}</small>}
        </button>
        {action && (
          <div className="settings-section-action" onClick={(event) => event.stopPropagation()}>
            {action}
          </div>
        )}
      </div>
      {open && <div className="settings-section-body">{children}</div>}
    </section>
  );
}

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
  onBackfillWeather,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [profileName, setProfileName] = useState(profile?.display_name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [sharingSavingCategory, setSharingSavingCategory] = useState('');
  const [weatherBackfill, setWeatherBackfill] = useState({ running: false, message: '' });
  const [openSections, setOpenSections] = useState(() => loadSectionState(userId));
  const sharing = useSharing(userId, CATEGORIES);

  useEffect(() => {
    setProfileName(profile?.display_name || '');
  }, [profile?.display_name]);

  useEffect(() => {
    setOpenSections(loadSectionState(userId));
  }, [userId]);

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

  async function toggleHidden(categoryId) {
    const hidden = settings.hidden_categories.includes(categoryId)
      ? settings.hidden_categories.filter((id) => id !== categoryId)
      : [...settings.hidden_categories, categoryId];
    await onSaveSettings({ ...settings, hidden_categories: hidden });
    setSelectedCategoryId(null);
  }

  async function setFinanceMode(categoryId, mode) {
    await onSaveSettings({
      ...settings,
      finance_modes: { ...settings.finance_modes, [categoryId]: mode },
    });
    setSelectedCategoryId(null);
  }

  async function setCategorySharing(categoryId, checked) {
    setSharingSavingCategory(categoryId);
    try {
      await sharing.setCategoryShared(categoryId, checked);
      setSelectedCategoryId(null);
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

  async function handleBackfillWeather() {
    if (!onBackfillWeather || weatherBackfill.running) return;
    if (!window.confirm('날씨가 비어 있는 기존 기록에 날씨를 저장할까요?')) return;

    setWeatherBackfill({ running: true, message: '누락된 날씨를 확인하는 중...' });
    try {
      const result = await onBackfillWeather((progress) => {
        setWeatherBackfill({
          running: true,
          message: `날씨 저장 중 ${progress.done}/${progress.total}개 · 성공 ${progress.updated}개 · 실패 ${progress.failed}개`,
        });
      });
      setWeatherBackfill({
        running: false,
        message: `완료: ${result.updated}개 저장, ${result.failed}개 실패`,
      });
    } catch (error) {
      setWeatherBackfill({
        running: false,
        message: error.message || '날씨 저장에 실패했습니다.',
      });
    }
  }

  async function updateReminderSetting(key, patch) {
    const current = settings.reminder_settings || {};
    await onSaveSettings({
      ...settings,
      reminder_settings: {
        ...current,
        [key]: {
          ...(current[key] || {}),
          ...patch,
        },
      },
    });
  }

  function toggleSettingsSection(sectionId) {
    setOpenSections((current) => {
      const next = { ...current, [sectionId]: !current[sectionId] };
      window.localStorage.setItem(getSectionStorageKey(userId), JSON.stringify(next));
      return next;
    });
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

      <SettingsSection
        sectionId="profile"
        eyebrow="Profile"
        title="내 프로필"
        summary={profile?.role || 'member'}
        open={Boolean(openSections.profile)}
        onToggle={toggleSettingsSection}
        className="profile-panel"
      >
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
      </SettingsSection>

      <SettingsSection
        sectionId="sharing"
        eyebrow="Sharing"
        title="친구/공유"
        summary={`${sharing.sharedCount}개 공유`}
        open={Boolean(openSections.sharing)}
        onToggle={toggleSettingsSection}
        className="share-settings-panel"
      >
        <ShareSettingsPanel sharing={sharing} embedded />
      </SettingsSection>

      <SettingsSection
        sectionId="categories"
        eyebrow="Categories"
        title="카테고리 설정"
        summary={`${CATEGORIES.length}개 카테고리`}
        open={Boolean(openSections.categories)}
        onToggle={toggleSettingsSection}
        action={(
          <CompactToggle
            checked={Boolean(settings.sort_by_record_count)}
            onChange={toggleSortByRecordCount}
            label="기록순"
          />
        )}
      >

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
                  <span className="tile-icon" style={getCategoryThemeStyle(category.id)}>{CATEGORY_ICONS[category.id]}</span>
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
      </SettingsSection>

      <SettingsSection
        sectionId="integrations"
        eyebrow="Integrations"
        title="데이터/연동"
        summary="알림 · 날씨 · API"
        open={Boolean(openSections.integrations)}
        onToggle={toggleSettingsSection}
        className="integration-panel"
      >
        <div className="settings-row reminder-setting-row">
          <div>
            <strong>월급 등록 알림</strong>
            <span>지정한 날짜에 앱을 켜면 월급 기록을 바로 등록할 수 있게 알려줍니다.</span>
          </div>
          <div className="reminder-controls">
            <input
              type="number"
              min="1"
              max="31"
              inputMode="numeric"
              value={settings.reminder_settings?.salary?.day || ''}
              onChange={(event) => updateReminderSetting('salary', { day: event.target.value })}
              placeholder="일"
              aria-label="월급일"
            />
            <CompactToggle
              checked={Boolean(settings.reminder_settings?.salary?.enabled)}
              onChange={(checked) => updateReminderSetting('salary', { enabled: checked })}
              label={settings.reminder_settings?.salary?.enabled ? 'ON' : 'OFF'}
            />
          </div>
        </div>
        <div className="settings-row reminder-setting-row">
          <div>
            <strong>적금 등록 알림</strong>
            <span>지정한 날짜에 적금 납입 기록을 빠르게 추가할 수 있게 알려줍니다.</span>
          </div>
          <div className="reminder-controls">
            <input
              type="number"
              min="1"
              max="31"
              inputMode="numeric"
              value={settings.reminder_settings?.savings?.day || ''}
              onChange={(event) => updateReminderSetting('savings', { day: event.target.value })}
              placeholder="일"
              aria-label="적금일"
            />
            <CompactToggle
              checked={Boolean(settings.reminder_settings?.savings?.enabled)}
              onChange={(checked) => updateReminderSetting('savings', { enabled: checked })}
              label={settings.reminder_settings?.savings?.enabled ? 'ON' : 'OFF'}
            />
          </div>
        </div>
        <div className="settings-row reminder-setting-row">
          <div>
            <strong>구독료 등록 알림</strong>
            <span>지정한 날짜에 구독료 기록을 빠르게 추가할 수 있게 알려줍니다.</span>
          </div>
          <div className="reminder-controls">
            <input
              type="number"
              min="1"
              max="31"
              inputMode="numeric"
              value={settings.reminder_settings?.subscription?.day || ''}
              onChange={(event) => updateReminderSetting('subscription', { day: event.target.value })}
              placeholder="일"
              aria-label="구독료일"
            />
            <CompactToggle
              checked={Boolean(settings.reminder_settings?.subscription?.enabled)}
              onChange={(checked) => updateReminderSetting('subscription', { enabled: checked })}
              label={settings.reminder_settings?.subscription?.enabled ? 'ON' : 'OFF'}
            />
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>한국투자 API</strong>
            <span>키와 토큰은 브라우저가 아니라 Supabase Edge Function secret으로만 다루도록 준비되어 있습니다.</span>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>누락된 날씨 채우기</strong>
            <span>기존 기록 중 날씨가 없는 항목만 찾아서 저장합니다. 이미 저장된 날씨는 다시 불러오지 않습니다.</span>
            {weatherBackfill.message && <small>{weatherBackfill.message}</small>}
          </div>
          <button
            type="button"
            className="secondary-button compact"
            onClick={handleBackfillWeather}
            disabled={weatherBackfill.running}
          >
            {weatherBackfill.running ? '실행 중' : '실행'}
          </button>
        </div>
      </SettingsSection>

      {isOwner && (
        <SettingsSection
          sectionId="admin"
          eyebrow="Admin"
          title="회원관리"
          summary="관리자 전용"
          open={Boolean(openSections.admin)}
          onToggle={toggleSettingsSection}
          className="admin-panel"
        >
          <AdminUserList enabled={isOwner} embedded />
        </SettingsSection>
      )}

      {selectedCategory && (
        <div className="modal-backdrop">
          <section className="category-option-modal bottom-sheet">
            <header className="modal-header">
              <div className="category-setting-head">
                <span className="tile-icon" style={getCategoryThemeStyle(selectedCategory.id)}>
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
