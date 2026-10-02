import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from '../src/components/Dashboard';
import CategoryView from '../src/components/CategoryView';
import RecordModal from '../src/components/RecordModal';
import SettingsScreen from '../src/components/SettingsScreen';
import FavoriteCategoryNav from '../src/components/FavoriteCategoryNav';
import { CATEGORIES, DEFAULT_FINANCE_MODES } from '../src/data/categoryDefinitions';
import { cleanRecordData } from '../src/services/recordStorage';
import { deriveRecordColumns, todayIso } from '../src/utils/recordUtils';
import '../src/styles.css';
import { useRecords } from '../src/hooks/useRecords';
import { useAppSettings } from '../src/hooks/useAppSettings';
import RecordCardsFixture from './record-cards-fixture';

function HooksFixture() {
  const [userId, setUserId] = useState('A');
  const records = useRecords(userId);
  const settings = useAppSettings(userId);
  return <main>
    <button onClick={() => setUserId('B')}>Account B</button>
    <button onClick={() => setUserId(null)}>Sign out</button>
    <output data-testid="hook-state">{JSON.stringify({ userId, records: records.records.map((record) => record.user_id),
      favorites: settings.settings.favorite_categories, error: records.error || settings.error, loading: records.loading || settings.loading })}</output>
  </main>;
}

const initialRecords = [
  { id: 'meal', user_id: 'fixture', category_id: 'workMeal', title: '테스트 식당', occurred_on: todayIso(), amount: 9000,
    data: { date: todayIso(), restaurant: '테스트 식당', menuItems: [{ name: '김치찌개', amount: 9000, unitPrice: 9000 }] } },
  { id: 'salary', user_id: 'fixture', category_id: 'salary', title: '테스트 월급', occurred_on: todayIso(), income_amount: 2700000,
    data: { company: '테스트', salaryBasis: '세후', netAmount: 2700000 } },
];

function Fixture() {
  const [view, setView] = useState('home');
  const [category, setCategory] = useState('workMeal');
  const [modal, setModal] = useState(null);
  const [records, setRecords] = useState(initialRecords);
  const [settings, setSettings] = useState({ category_order: CATEGORIES.map((item) => item.id), hidden_categories: [],
    favorite_categories: ['workMeal', 'shopping'], finance_modes: DEFAULT_FINANCE_MODES, sort_by_record_count: true, reminder_settings: {} });
  const [filters, setFilters] = useState({});
  const [profile, setProfile] = useState({ display_name: '테스트 사용자' });
  const openCategory = (id) => { setCategory(id); setView('category'); };
  const onAdd = (id) => setModal({ categoryId: id || 'workMeal' });
  const onEdit = (record) => setModal({ categoryId: record.category_id, record });
  window.fixture = { ...(window.fixture || {}), openForm: onAdd, editMeal: () => onEdit(records[0]) };
  return <div className="app-shell">
    {view === 'home' && <Dashboard profile={profile} records={records} settings={settings} filters={filters} onFiltersChange={setFilters}
      onAdd={onAdd} onOpenCategory={openCategory} onOpenRecord={onEdit} onEdit={onEdit} onDelete={() => {}} />}
    {view === 'category' && <CategoryView categoryId={category} records={records} onBack={() => setView('home')} onAdd={onAdd}
      onOpenRecord={onEdit} onEdit={onEdit} onDelete={() => {}} quotesPaused />}
    {view === 'settings' && <SettingsScreen userId="fixture" profile={profile} records={records} settings={settings}
      onSaveSettings={async (value) => setSettings(value)} onUpdateProfile={async (value) => setProfile({ display_name: value })}
      onBack={() => setView('home')} onSignOut={() => {}} onBackfillWeather={async () => ({ total: 0, updated: 0, failed: 0 })}
      onExportRecords={async () => records} />}
    <nav className="bottom-nav" aria-label="하단 내비게이션">
      <button type="button" className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}><span className="bottom-nav-icon">⌂</span><span>홈</span></button>
      <FavoriteCategoryNav settings={settings} onOpenCategory={openCategory} onManage={() => setView('settings')} />
      <button type="button" className={view === 'settings' ? 'is-active' : ''} onClick={() => setView('settings')}><span className="bottom-nav-icon">⚙</span><span>설정</span></button>
    </nav>
    {modal && <RecordModal key={`${modal.categoryId}-${modal.record?.id || 'new'}`} {...modal} onClose={() => setModal(null)}
      onSave={async (categoryId, formData, record, draftId) => {
        window.fixture.attemptIds = [...(window.fixture.attemptIds || []), draftId];
        if (window.fixture.failSave) throw new Error('테스트 저장 실패');
        const data = cleanRecordData(categoryId, formData);
        const next = { ...record, id: record?.id || draftId, user_id: 'fixture', category_id: categoryId, ...deriveRecordColumns(categoryId, data), data };
        window.fixture.saved = next;
        setRecords((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      }} />}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode>{location.search.includes('cards') ? <RecordCardsFixture /> : location.search.includes('hooks') ? <HooksFixture /> : <Fixture />}</React.StrictMode>);
