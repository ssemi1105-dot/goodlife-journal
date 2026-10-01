import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_FINANCE_MODES, getDefaultCategoryOrder } from '../data/categoryDefinitions';

const DEFAULT_REMINDER_SETTINGS = {
  salary: { enabled: false, day: '' },
  savings: { enabled: false, day: '' },
  subscription: { enabled: false, day: '' },
  dismissed: {},
};

const DEFAULT_SETTINGS = {
  category_order: getDefaultCategoryOrder(),
  hidden_categories: [],
  favorite_categories: [],
  finance_modes: DEFAULT_FINANCE_MODES,
  sort_by_record_count: true,
  reminder_settings: DEFAULT_REMINDER_SETTINGS,
};

function normalizeReminderSettings(value = {}) {
  return {
    salary: { ...DEFAULT_REMINDER_SETTINGS.salary, ...(value.salary || {}) },
    savings: { ...DEFAULT_REMINDER_SETTINGS.savings, ...(value.savings || {}) },
    subscription: { ...DEFAULT_REMINDER_SETTINGS.subscription, ...(value.subscription || {}) },
    dismissed: value.dismissed || {},
  };
}

export function useAppSettings(userId) {
  const [state, setState] = useState({ userId: null, settings: DEFAULT_SETTINGS });
  const settings = state.userId === userId ? state.settings : DEFAULT_SETTINGS;
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const generation = useRef(0);
  const loadedUser = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const request = ++generation.current;
    loadedUser.current = null;
    if (!userId) {
      setState({ userId: null, settings: DEFAULT_SETTINGS });
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then((result) => result, (loadError) => ({ data: null, error: loadError }));

    if (request !== generation.current || activeUser.current !== userId) return;
    if (error) {
      setLoading(false);
      setError('설정을 불러오지 못했습니다. 다시 시도해주세요.');
      return;
    }

    const rawFinanceModes = data?.finance_modes || {};
    const merged = {
      category_order: data?.category_order?.length ? data.category_order : DEFAULT_SETTINGS.category_order,
      hidden_categories: data?.hidden_categories || [],
      favorite_categories: Array.isArray(rawFinanceModes.__favorite_categories) ? rawFinanceModes.__favorite_categories : [],
      finance_modes: { ...DEFAULT_FINANCE_MODES, ...rawFinanceModes },
      sort_by_record_count: rawFinanceModes.__sort_by_record_count ?? DEFAULT_SETTINGS.sort_by_record_count,
      reminder_settings: normalizeReminderSettings(rawFinanceModes.__reminder_settings),
    };

    loadedUser.current = userId;
    setState({ userId, settings: merged });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load().catch(() => { if (activeUser.current === userId) { setError('설정 연결에 실패했습니다.'); setLoading(false); } });
    return () => { generation.current += 1; };
  }, [load]);

  async function saveSettings(next) {
    if (!userId || loadedUser.current !== userId) throw new Error('설정을 불러온 다음 다시 시도해주세요.');
    const financeModes = {
      ...DEFAULT_FINANCE_MODES,
      ...(next.finance_modes || {}),
      __sort_by_record_count: next.sort_by_record_count ?? DEFAULT_SETTINGS.sort_by_record_count,
      __reminder_settings: normalizeReminderSettings(next.reminder_settings),
      __favorite_categories: Array.isArray(next.favorite_categories) ? next.favorite_categories : [],
    };
    const normalized = {
      category_order: next.category_order || DEFAULT_SETTINGS.category_order,
      hidden_categories: next.hidden_categories || [],
      favorite_categories: financeModes.__favorite_categories,
      finance_modes: financeModes,
      sort_by_record_count: next.sort_by_record_count ?? DEFAULT_SETTINGS.sort_by_record_count,
      reminder_settings: financeModes.__reminder_settings,
    };

    const { error } = await supabase.from('app_settings').upsert({
      user_id: userId,
      category_order: normalized.category_order,
      hidden_categories: normalized.hidden_categories,
      finance_modes: normalized.finance_modes,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    if (activeUser.current === userId) setState({ userId, settings: normalized });
  }

  return { settings, loading, error, saveSettings, reloadSettings: load };
}
