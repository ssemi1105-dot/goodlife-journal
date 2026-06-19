import { useEffect, useMemo, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import CategoryView from './components/CategoryView';
import Dashboard from './components/Dashboard';
import RecordDetailModal from './components/RecordDetailModal';
import RecordModal from './components/RecordModal';
import SettingsScreen from './components/SettingsScreen';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_MAP } from './data/categoryDefinitions';
import { useAppSettings } from './hooks/useAppSettings';
import { useAuth } from './hooks/useAuth';
import { useRecords } from './hooks/useRecords';

const EMPTY_FILTERS = { query: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', minRating: '' };

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
            <button className="category-tile" key={category.id} onClick={() => onSelect(category.id)}>
              <span className="tile-icon" style={{ background: `${category.color}18`, color: category.color }}>{CATEGORY_ICONS[category.id]}</span>
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
  const [viewingRecord, setViewingRecord] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const normalizedSettings = useMemo(() => {
    const allIds = CATEGORIES.map((category) => category.id);
    const ordered = [...settings.category_order, ...allIds.filter((id) => !settings.category_order.includes(id))];
    return { ...settings, category_order: ordered };
  }, [settings]);

  function openAdd(categoryId) {
    setEditingRecord(null);
    if (categoryId) setModalCategory(categoryId);
    else setShowPicker(true);
  }

  function openEdit(record) {
    setViewingRecord(null);
    setEditingRecord(record);
    setModalCategory(record.category_id);
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
    <div className="app-shell">
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
            setModalCategory(categoryId);
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
          onClose={() => {
            setModalCategory(null);
            setEditingRecord(null);
          }}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}
