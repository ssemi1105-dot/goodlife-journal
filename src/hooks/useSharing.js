import { useCallback, useEffect, useMemo, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabaseClient';

const DEFAULT_SHARE = { is_shared: false, allow_friend_compare: true };

function shareErrorMessage(status, payload, fallback = '공유 설정을 처리하지 못했습니다.') {
  const serverMessage = payload?.error || payload?.message || '';
  if (status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
  if (status === 403) return '이 공유 작업을 할 권한이 없습니다.';
  if (status === 404) return '친구 관리 Edge Function이 아직 배포되지 않았습니다.';
  if (status >= 500) return serverMessage || '공유 서버 설정 또는 Edge Function 로그를 확인해 주세요.';
  if (status === 0) return '공유 서버에 연결하지 못했습니다. 네트워크 또는 배포 상태를 확인해 주세요.';
  return serverMessage || fallback;
}

async function callFriendFunction(action, body = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    const error = new Error('로그인이 필요합니다.');
    error.status = 401;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/friend-actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...body }),
    });
  } catch (error) {
    error.status = 0;
    throw error;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(shareErrorMessage(response.status, payload));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function useSharing(userId, categories = []) {
  const [shareSettings, setShareSettings] = useState({});
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [friendError, setFriendError] = useState('');

  const loadShareSettings = useCallback(async () => {
    if (!userId || !supabase) return;
    const { data, error } = await supabase
      .from('user_share_settings')
      .select('category_key, is_shared, allow_friend_compare')
      .eq('user_id', userId);

    if (error) {
      console.warn('[sharing] user_share_settings load failed:', error);
      return;
    }

    setShareSettings(Object.fromEntries((data || []).map((item) => [item.category_key, {
      is_shared: Boolean(item.is_shared),
      allow_friend_compare: item.allow_friend_compare !== false,
    }])));
  }, [userId]);

  const loadFriends = useCallback(async () => {
    if (!userId || !supabase) return;
    setFriendError('');
    try {
      const payload = await callFriendFunction('list');
      setFriends(payload?.friends || []);
    } catch (error) {
      setFriendError(shareErrorMessage(error.status || 0, error.payload, error.message));
    }
  }, [userId]);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      await Promise.all([loadShareSettings(), loadFriends()]);
    } finally {
      setLoading(false);
    }
  }, [loadFriends, loadShareSettings, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const sharedCount = useMemo(
    () => categories.filter((category) => shareSettings[category.id]?.is_shared).length,
    [categories, shareSettings],
  );

  async function setCategoryShared(categoryKey, isShared) {
    const previous = shareSettings[categoryKey] || DEFAULT_SHARE;
    const next = { ...previous, is_shared: isShared };
    setShareSettings((current) => ({ ...current, [categoryKey]: next }));

    const { error } = await supabase.from('user_share_settings').upsert({
      user_id: userId,
      category_key: categoryKey,
      is_shared: isShared,
      allow_friend_compare: next.allow_friend_compare,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setShareSettings((current) => ({ ...current, [categoryKey]: previous }));
      throw error;
    }
  }

  async function setCompareAllowed(categoryKey, allowed) {
    const previous = shareSettings[categoryKey] || DEFAULT_SHARE;
    const next = { ...previous, allow_friend_compare: allowed };
    setShareSettings((current) => ({ ...current, [categoryKey]: next }));

    const { error } = await supabase.from('user_share_settings').upsert({
      user_id: userId,
      category_key: categoryKey,
      is_shared: next.is_shared,
      allow_friend_compare: allowed,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setShareSettings((current) => ({ ...current, [categoryKey]: previous }));
      throw error;
    }
  }

  async function sendFriendRequest(email) {
    setFriendError('');
    try {
      await callFriendFunction('send-request', { email });
      await loadFriends();
    } catch (error) {
      setFriendError(shareErrorMessage(error.status || 0, error.payload, error.message));
      throw error;
    }
  }

  async function respondToFriendship(friendshipId, status) {
    setFriendError('');
    try {
      await callFriendFunction('respond', { friendshipId, status });
      await loadFriends();
    } catch (error) {
      setFriendError(shareErrorMessage(error.status || 0, error.payload, error.message));
      throw error;
    }
  }

  return {
    shareSettings,
    friends,
    loading,
    friendError,
    sharedCount,
    reload,
    setCategoryShared,
    setCompareAllowed,
    sendFriendRequest,
    respondToFriendship,
  };
}
