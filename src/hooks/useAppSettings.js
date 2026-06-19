import { useCallback, useEffect, useState } from 'react';
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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      setLoading(false);
      throw error;
    }

    const rawFinanceModes = data?.finance_modes || {};
    const merged = {
      category_order: data?.category_order?.length ? data.category_order : DEFAULT_SETTINGS.category_order,
      hidden_categories: data?.hidden_categories || [],
      finance_modes: { ...DEFAULT_FINANCE_MODES, ...rawFinanceModes },
      sort_by_record_count: rawFinanceModes.__sort_by_record_count ?? DEFAULT_SETTINGS.sort_by_record_count,
      reminder_settings: normalizeReminderSettings(rawFinanceModes.__reminder_settings),
    };

    setSettings(merged);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(next) {
    const financeModes = {
      ...DEFAULT_FINANCE_MODES,
      ...(next.finance_modes || {}),
      __sort_by_record_count: next.sort_by_record_count ?? DEFAULT_SETTINGS.sort_by_record_count,
      __reminder_settings: normalizeReminderSettings(next.reminder_settings),
    };
    const normalized = {
      category_order: next.category_order || DEFAULT_SETTINGS.category_order,
      hidden_categories: next.hidden_categories || [],
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
    setSettings(normalized);
  }

  return { settings, loading, saveSettings, reloadSettings: load };
}
