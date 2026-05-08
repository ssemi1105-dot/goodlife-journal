import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_FINANCE_MODES, getDefaultCategoryOrder } from '../data/categoryDefinitions';

const DEFAULT_SETTINGS = {
  category_order: getDefaultCategoryOrder(),
  hidden_categories: [],
  finance_modes: DEFAULT_FINANCE_MODES,
};

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

    const merged = {
      category_order: data?.category_order?.length ? data.category_order : DEFAULT_SETTINGS.category_order,
      hidden_categories: data?.hidden_categories || [],
      finance_modes: { ...DEFAULT_FINANCE_MODES, ...(data?.finance_modes || {}) },
    };

    setSettings(merged);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(next) {
    const normalized = {
      category_order: next.category_order || DEFAULT_SETTINGS.category_order,
      hidden_categories: next.hidden_categories || [],
      finance_modes: { ...DEFAULT_FINANCE_MODES, ...(next.finance_modes || {}) },
    };

    const { error } = await supabase.from('app_settings').upsert({
      user_id: userId,
      ...normalized,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    setSettings(normalized);
  }

  return { settings, loading, saveSettings, reloadSettings: load };
}
