import { useEffect, useMemo, useRef, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import CategoryView from './components/CategoryView';
import Dashboard from './components/Dashboard';
import FavoriteCategoryNav from './components/FavoriteCategoryNav';
import RecordDetailModal from './components/RecordDetailModal';
import RecordModal from './components/RecordModal';
import SettingsScreen from './components/SettingsScreen';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_MAP, getCategoryThemeStyle } from './data/categoryDefinitions';
import { useAppSettings } from './hooks/useAppSettings';
import { useAuth } from './hooks/useAuth';
import { useRecords } from './hooks/useRecords';
import { runTactileTransition } from './utils/tactileTransition';
import { deriveRecordColumns, getInvestmentAssetKey, validateInvestmentLedger } from './utils/recordUtils';

const EMPTY_FILTERS = { query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' };
const APP_HISTORY_KEY = 'goodlifeNavigation';

const REMINDER_DEFINITIONS = [
  {
    id: 'salary',
    categoryId: 'salary',
    icon: '💰',
    title: '오늘은 월급날이에요',
    body: '월급 기록을 등록하시겠습니까?',
    actionLabel: '월급 등록',
    makeInitialData: (today) => ({ date: today, salaryBasis: '세후' }),
  },
  {
    id: 'savings',
    categoryId: 'savings',
    icon: '🏦',
    title: '오늘은 적금 납입일이에요',
    body: '적금 기록을 등록하시겠습니까?',
    actionLabel: '적금 등록',
    makeInitialData: (today) => ({ date: today }),
  },
  {
    id: 'subscription',
    categoryId: 'subscription',
    icon: '🔁',
    title: '오늘은 구독료 확인일이에요',
    body: '구독료 기록을 등록하시겠습니까?',
    actionLabel: '구독료 등록',
    makeInitialData: (today, day) => ({ date: today, billingDay: String(day), active: true }),
  },
];

function todayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function reminderDismissKey(reminderId, date) {
  return `${reminderId}-${date}`;
}

function ReminderPrompt({ reminder, onRegister, onDismiss }) {
  if (!reminder) return null;
  return (
    <section className="daily-reminder-banner">
      <div>
        <span>{reminder.icon}</span>
        <div>
          <strong>{reminder.title}</strong>
          <p>{reminder.body}</p>
        </div>
      </div>
      <div className="daily-reminder-actions">
        <button type="button" className="primary-button compact" onClick={onRegister}>{reminder.actionLabel}</button>
        <button type="button" className="secondary-button compact" onClick={onDismiss}>오늘은 안 보기</button>
      </div>
    </section>
  );
}

function CategoryPicker({ settings, onSelect, onClose }) {
  const categories = settings.category_order
    .map((id) => CATEGORY_MAP[id])
    .filter(Boolean)
    .filter((category) => !settings.hidden_categories.includes(category.id));

  return (
    <div className="modal-backdrop">
      <section className="picker-panel" data-transition-surface="picker-surface" style={{ viewTransitionName: 'picker-surface' }}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">New record</p>
            <h2>카테고리 선택</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </header>
        <div className="category-grid">
          {categories.map((category) => (
            <button className="category-tile" style={getCategoryThemeStyle(category.id)} key={category.id} onClick={(event) => onSelect(category.id, event.currentTarget)}>
              <span className="tile-icon">{CATEGORY_ICONS[category.id]}</span>
              <strong>{category.label}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const { settings, saveSettings, error: settingsError, reloadSettings } = useAppSettings(auth.userId);
  const { records, loading: recordsLoading, error: recordsError, saveRecord, deleteRecord, backfillMissingWeather, exportRecords, reloadRecords } = useRecords(auth.userId);
  const [view, setView] = useState('home');
  const [activeCategory, setActiveCategory] = useState(null);
  const [modalCategory, setModalCategory] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [modalInitialData, setModalInitialData] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const recordsRef = useRef(records);
  const today = todayLocalIso();
  const todayDay = Number(today.slice(-2));

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  function applyNavigationState(navigationState) {
    const nextView = ['home', 'category', 'settings'].includes(navigationState?.view)
      ? navigationState.view
      : 'home';
    const nextLayer = navigationState?.layer || '';
    const targetRecord = navigationState?.recordId
      ? recordsRef.current.find((record) => record.id === navigationState.recordId) || null
      : null;

    setView(nextView);
    setActiveCategory(nextView === 'category' ? navigationState?.activeCategory || null : null);
    setShowPicker(nextLayer === 'picker');
    setViewingRecord(nextLayer === 'record' ? targetRecord : null);
    setModalCategory(nextLayer === 'form' ? navigationState?.modalCategory || null : null);
    setEditingRecord(nextLayer === 'form' ? targetRecord : null);
    setModalInitialData(nextLayer === 'form' ? navigationState?.initialData || null : null);
  }

  function setNavigationState(navigationState, { replace = false } = {}) {
    const nextState = {
      [APP_HISTORY_KEY]: true,
      view: navigationState.view || 'home',
      activeCategory: navigationState.activeCategory || null,
      layer: navigationState.layer || '',
      modalCategory: navigationState.modalCategory || null,
      recordId: navigationState.recordId || null,
      initialData: navigationState.initialData || null,
    };
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](nextState, '', window.location.href);
    applyNavigationState(nextState);
  }

  function currentBaseNavigation() {
    return {
      view,
      activeCategory: view === 'category' ? activeCategory : null,
    };
  }

  function navigateBack(fallback = { view: 'home' }) {
    const currentState = window.history.state;
    if (currentState?.[APP_HISTORY_KEY] && (currentState.layer || currentState.view !== 'home')) {
      window.history.back();
      return;
    }
    setNavigationState(fallback, { replace: true });
  }

  function navigateToView(nextView) {
    if (view === nextView && !showPicker && !viewingRecord && !modalCategory) return;
    setNavigationState({ view: nextView });
  }

  useEffect(() => {
    if (!auth.userId) return undefined;

    const homeState = {
      [APP_HISTORY_KEY]: true,
      view: 'home',
      activeCategory: null,
      layer: '',
      modalCategory: null,
      recordId: null,
      initialData: null,
    };
    window.history.replaceState(homeState, '', window.location.href);
    applyNavigationState(homeState);

    function handlePopState(event) {
      if (event.state?.[APP_HISTORY_KEY]) {
        applyNavigationState(event.state);
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [auth.userId]);

  const normalizedSettings = useMemo(() => {
    const allIds = CATEGORIES.map((category) => category.id);
    const ordered = [...settings.category_order, ...allIds.filter((id) => !settings.category_order.includes(id))];
    return { ...settings, category_order: ordered };
  }, [settings]);

  const dueReminder = useMemo(() => {
    const reminderSettings = normalizedSettings.reminder_settings || {};
    const dismissed = reminderSettings.dismissed || {};
    return REMINDER_DEFINITIONS.find((reminder) => {
      const config = reminderSettings[reminder.id] || {};
      if (!config.enabled || Number(config.day) !== todayDay) return false;
      if (dismissed[reminderDismissKey(reminder.id, today)]) return false;
      return !records.some((record) => record.category_id === reminder.categoryId && record.occurred_on === today);
    });
  }, [normalizedSettings.reminder_settings, records, today, todayDay]);

  const workMealRestaurantSuggestions = useMemo(() => {
    const restaurantStats = new Map();

    records.forEach((record) => {
      if (record.category_id !== 'workMeal') return;
      const restaurant = String(record.data?.restaurant || '').trim();
      if (!restaurant) return;

      const key = restaurant.toLocaleLowerCase('ko-KR');
      const usedAt = record.updated_at || record.created_at || record.occurred_on || '';
      const previous = restaurantStats.get(key) || { name: restaurant, count: 0, usedAt: '' };
      restaurantStats.set(key, {
        name: previous.name,
        count: previous.count + 1,
        usedAt: usedAt > previous.usedAt ? usedAt : previous.usedAt,
      });
    });

    return [...restaurantStats.values()]
      .sort((left, right) => right.count - left.count || right.usedAt.localeCompare(left.usedAt))
      .map((item) => item.name)
      .slice(0, 30);
  }, [records]);

  function openAdd(categoryId, initialData = null, sourceElement = null) {
    const commit = () => {
      if (categoryId) {
        setNavigationState({
          ...currentBaseNavigation(),
          layer: 'form',
          modalCategory: categoryId,
          initialData,
        }, { replace: showPicker });
      } else {
        setNavigationState({ ...currentBaseNavigation(), layer: 'picker' });
      }
    };

    return runTactileTransition(
      sourceElement,
      categoryId ? 'form-surface' : 'picker-surface',
      commit,
    );
  }

  function openCategory(categoryId, sourceElement) {
    return runTactileTransition(sourceElement, 'category-surface', () => {
      setNavigationState({ view: 'category', activeCategory: categoryId });
    });
  }

  function openRecord(record, sourceElement) {
    return runTactileTransition(sourceElement, 'record-surface', () => {
      setNavigationState({
        ...currentBaseNavigation(),
        layer: 'record',
        recordId: record.id,
      });
    });
  }

  function openEdit(record) {
    setNavigationState({
      ...currentBaseNavigation(),
      layer: 'form',
      modalCategory: record.category_id,
      recordId: record.id,
    });
  }

  async function dismissReminder(reminder) {
    const current = normalizedSettings.reminder_settings || {};
    await saveSettings({
      ...normalizedSettings,
      reminder_settings: {
        ...current,
        dismissed: {
          ...(current.dismissed || {}),
          [reminderDismissKey(reminder.id, today)]: true,
        },
      },
    });
  }

  async function registerFromReminder(reminder) {
    await dismissReminder(reminder);
    openAdd(reminder.categoryId, reminder.makeInitialData(today, todayDay));
  }

  async function updateRecordData(id, data) {
    const existingRecord = recordsRef.current.find((record) => record.id === id);
    if (!existingRecord) throw new Error('업데이트할 기록을 찾을 수 없습니다.');
    await saveRecord(
      existingRecord.category_id,
      {
        ...existingRecord.data,
        ...data,
        date: data.date || existingRecord.data?.date || existingRecord.occurred_on,
      },
      existingRecord,
    );
  }

  async function saveRecordWithRules(categoryId, formData, existingRecord = null, draftId = null) {
    if (categoryId === 'annual_leave' && formData.recordType === 'grant') {
      const year = String(formData.year || new Date().getFullYear());
      const existingGrant = records.find((record) => (
        record.category_id === 'annual_leave'
        && record.id !== existingRecord?.id
        && record.data?.recordType === 'grant'
        && String(record.data?.year) === year
      ));
      await saveRecord(categoryId, formData, existingRecord || existingGrant || null, draftId);
      return;
    }

    if (categoryId === 'investment') {
      const ledgerRecords = await exportRecords();
      const candidate = { ...existingRecord, id: existingRecord?.id || draftId,
        created_at: existingRecord?.created_at || new Date().toISOString(), category_id: categoryId,
        ...deriveRecordColumns(categoryId, formData), data: formData };
      const affected = new Set([getInvestmentAssetKey(formData), getInvestmentAssetKey(existingRecord?.data || {})]);
      validateInvestmentLedger([...ledgerRecords.filter((record) => record.id !== candidate.id), candidate], affected);
    }

    await saveRecord(categoryId, formData, existingRecord, draftId);
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view, activeCategory]);

  async function confirmDelete(record) {
    if (!window.confirm('이 기록을 삭제할까요?')) return;
    try {
      if (record.category_id === 'investment') {
        const current = await exportRecords();
        validateInvestmentLedger(current.filter((item) => item.id !== record.id), new Set([getInvestmentAssetKey(record.data)]));
      }
      await deleteRecord(record);
      if (viewingRecord?.id === record.id) navigateBack(currentBaseNavigation());
    } catch (err) {
      window.alert(err.message || '삭제하지 못했습니다. 다시 시도해주세요.');
    }
  }

  if (auth.loading) {
    return <div className="loading-screen">불러오는 중</div>;
  }

  if (!auth.session) {
    return <AuthScreen configured={auth.configured} onSignIn={auth.signIn} onSignUp={auth.signUp} />;
  }

  return (
    <div className={`app-shell ${viewingRecord ? 'has-pushed-detail' : ''}`}>
      {view === 'home' && (
        <Dashboard
          profile={auth.profile}
          records={records}
          settings={normalizedSettings}
          filters={filters}
          onFiltersChange={setFilters}
          onOpenCategory={openCategory}
          onAdd={openAdd}
          onOpenRecord={openRecord}
          onEdit={openEdit}
          onDelete={confirmDelete}
        />
      )}

      {view === 'home' && dueReminder && (
        <ReminderPrompt
          reminder={dueReminder}
          onRegister={() => registerFromReminder(dueReminder)}
          onDismiss={() => dismissReminder(dueReminder)}
        />
      )}

      {view === 'category' && activeCategory && (
        <CategoryView
          categoryId={activeCategory}
          records={records}
          onBack={() => navigateBack({ view: 'home' })}
          onAdd={openAdd}
          onOpenRecord={openRecord}
          onEdit={openEdit}
          onDelete={confirmDelete}
          onUpdateRecord={updateRecordData}
          quotesPaused={Boolean(modalCategory || viewingRecord)}
        />
      )}

      {view === 'settings' && (
        <SettingsScreen
          userId={auth.userId}
          profile={auth.profile}
          settings={normalizedSettings}
          records={records}
          isOwner={auth.isOwner}
          onSaveSettings={saveSettings}
          onUpdateProfile={auth.updateProfile}
          onSignOut={auth.signOut}
          onBack={() => navigateBack({ view: 'home' })}
          onBackfillWeather={backfillMissingWeather}
          onExportRecords={exportRecords}
        />
      )}

      {recordsLoading && <div className="sync-indicator">동기화 중</div>}
      {recordsError && <div className="sync-error" role="alert">{recordsError}<button type="button" onClick={reloadRecords}>다시 불러오기</button></div>}
      {!recordsError && settingsError && <div className="sync-error" role="alert">{settingsError}<button type="button" onClick={reloadSettings}>다시 불러오기</button></div>}

      <nav className="bottom-nav" aria-label="하단 내비게이션">
        <button type="button" className={view === 'home' ? 'is-active' : ''} onClick={() => navigateToView('home')}>
          <span className="bottom-nav-icon" aria-hidden="true">⌂</span>
          <span>홈</span>
        </button>
        <FavoriteCategoryNav
          settings={normalizedSettings}
          onOpenCategory={openCategory}
          onManage={() => {
            const key = `goodlife-settings-sections-${auth.userId || 'guest'}`;
            try {
              const saved = JSON.parse(window.localStorage.getItem(key) || '{}');
              window.localStorage.setItem(key, JSON.stringify({ ...saved, categories: true }));
            } catch {
              // SettingsScreen falls back to its defaults when storage is unavailable.
            }
            navigateToView('settings');
          }}
        />
        <button type="button" className={view === 'settings' ? 'is-active' : ''} onClick={() => navigateToView('settings')}>
          <span className="bottom-nav-icon" aria-hidden="true">⚙</span>
          <span>설정</span>
        </button>
      </nav>

      {showPicker && (
        <CategoryPicker
          settings={normalizedSettings}
          onClose={() => navigateBack(currentBaseNavigation())}
          onSelect={(categoryId, sourceElement) => openAdd(categoryId, null, sourceElement)}
        />
      )}

      {viewingRecord && (
        <RecordDetailModal
          record={viewingRecord}
          onClose={() => navigateBack(currentBaseNavigation())}
          onEdit={openEdit}
          onDelete={confirmDelete}
        />
      )}

      {modalCategory && (
        <RecordModal
          categoryId={modalCategory}
          record={editingRecord}
          initialData={modalInitialData}
          fieldSuggestions={modalCategory === 'workMeal' ? { restaurant: workMealRestaurantSuggestions } : {}}
          onClose={() => navigateBack(currentBaseNavigation())}
          onSave={saveRecordWithRules}
        />
      )}
    </div>
  );
}
