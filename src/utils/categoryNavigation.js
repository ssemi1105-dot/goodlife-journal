import { CATEGORIES, CATEGORY_MAP } from '../data/categoryDefinitions';

// Display-only projection: never changes stored order, hidden flags, or favorites.
export function getCategoryNavigation(records = [], settings = {}) {
  const counts = new Map();
  for (const record of records) counts.set(record.category_id, (counts.get(record.category_id) || 0) + 1);
  const ids = [...new Set([...(settings.category_order || []), ...CATEGORIES.map(category => category.id)])];
  const all = ids.filter(id => CATEGORY_MAP[id]).map((id, order) => ({
    category: CATEGORY_MAP[id], count: counts.get(id) || 0, order,
    hidden: (settings.hidden_categories || []).includes(id),
  }));
  const byCount = (a, b) => b.count - a.count || a.order - b.order;
  const visible = all.filter(item => !item.hidden);
  const favoriteIds = [...new Set(settings.favorite_categories || [])];
  return {
    all: settings.sort_by_record_count ? [...all].sort(byCount) : all,
    favorites: favoriteIds.map(id => visible.find(item => item.category.id === id)).filter(Boolean),
    frequent: [...visible].filter(item => item.count > 0).sort(byCount).slice(0, 6),
  };
}
