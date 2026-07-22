import { useEffect, useMemo, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import CategoryView from './components/CategoryView';
import Dashboard from './components/Dashboard';
import RecordDetailModal from './components/RecordDetailModal';
import RecordModal from './components/RecordModal';
import SettingsScreen from './components/SettingsScreen';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_MAP, getCategoryThemeStyle } from './data/categoryDefinitions';
import { useAppSettings } from './hooks/useAppSettings';
import { useAuth } from './hooks/useAuth';
import { useRecords } from './hooks/useRecords';

const EMPTY_FILTERS = { query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' };

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
      <section className="picker-panel">
        <header className="modal-header">
          <div>
            <p className="eyebrow">New record</p>
            <h2>카테고리 선택</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </header>
        <div className="category-grid">
          {categories.map((category) => (
            <button className="category-tile" style={getCategoryThemeStyle(category.id)} key={category.id} onClick={() => onSelect(category.id)}>
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
  const { settings, saveSettings } = useAppSettings(auth.userId);
  const { records, loading: recordsLoading, saveRecord, deleteRecord, backfillMissingWeather } = useRecords(auth.userId);
  const [view, setView] = useState('home');
  const [activeCategory, setActiveCategory] = useState(null);
  const [modalCategory, setModalCategory] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [modalInitialData, setModalInitialData] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const today = todayLocalIso();
  const todayDay = Number(today.slice(-2));

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

  function openAdd(categoryId, initialData = null) {
    setEditingRecord(null);
    setModalInitialData(initialData);
    if (categoryId) {
      setModalCategory(categoryId);
    } else {
      setShowPicker(true);
    }
  }

  function openEdit(record) {
    setViewingRecord(null);
    setEditingRecord(record);
    setModalInitialData(null);
    setModalCategory(record.category_id);
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
    const existingRecord = records.find((record) => record.id === id);
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view, activeCategory]);

  async function confirmDelete(record) {
    if (!window.confirm('이 기록을 삭제할까요?')) return;
    await deleteRecord(record);
    setViewingRecord(null);
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
          onOpenCategory={(categoryId) => {
            setActiveCategory(categoryId);
            setView('category');
          }}
          onAdd={openAdd}
          onOpenRecord={setViewingRecord}
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
          onBack={() => setView('home')}
          onAdd={openAdd}
          onOpenRecord={setViewingRecord}
          onEdit={openEdit}
          onDelete={confirmDelete}
          onUpdateRecord={updateRecordData}
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
          onBack={() => setView('home')}
          onBackfillWeather={backfillMissingWeather}
        />
      )}

      {recordsLoading && <div className="sync-indicator">동기화 중</div>}

      <button
        type="button"
        className="bottom-fab"
        onClick={() => openAdd(view === 'category' ? activeCategory : null)}
        aria-label="기록 추가"
      >
        +
      </button>

      <nav className="bottom-nav" aria-label="하단 내비게이션">
        <button type="button" className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}>
          <span>홈</span>
        </button>
        <span className="bottom-nav-spacer" aria-hidden="true" />
        <button type="button" className={view === 'settings' ? 'is-active' : ''} onClick={() => setView('settings')}>
          <span>설정</span>
        </button>
      </nav>

      {showPicker && (
        <CategoryPicker
          settings={normalizedSettings}
          onClose={() => setShowPicker(false)}
          onSelect={(categoryId) => {
            setShowPicker(false);
            openAdd(categoryId);
          }}
        />
      )}

      {viewingRecord && (
        <RecordDetailModal
          record={viewingRecord}
          onClose={() => setViewingRecord(null)}
          onEdit={openEdit}
          onDelete={confirmDelete}
        />
      )}

      {modalCategory && (
        <RecordModal
          categoryId={modalCategory}
          record={editingRecord}
          initialData={modalInitialData}
          onClose={() => {
            setModalCategory(null);
            setEditingRecord(null);
            setModalInitialData(null);
          }}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}
