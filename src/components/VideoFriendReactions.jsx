import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabaseClient';

function getReactionError(status, payload) {
  const serverMessage = payload?.error || '';
  if (status === 401) return '친구 반응을 보려면 다시 로그인해 주세요.';
  if (status === 403) return '친구 반응을 볼 권한이 없습니다.';
  if (status === 404) return 'shared-video-reactions Edge Function이 아직 배포되지 않았습니다.';
  if (status >= 500) return serverMessage || '친구 반응 서버 설정을 확인해 주세요.';
  if (status === 0) return '친구 반응 서버에 연결하지 못했습니다.';
  return serverMessage || '친구 반응을 불러오지 못했습니다.';
}

async function loadReactions(record, signal) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    const error = new Error('로그인이 필요합니다.');
    error.status = 401;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/shared-video-reactions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tmdbId: record.data?.tmdbId || record.data?.title?.id || null,
        title: record.data?.tmdbTitle || record.data?.title?.title || record.title,
        recordId: record.id,
      }),
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
    const error = new Error(getReactionError(response.status, payload));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload || { reactions: [], averageRating: 0 };
}

export default function VideoFriendReactions({ record }) {
  const [state, setState] = useState({ loading: false, error: '', reactions: [], averageRating: 0 });
  const tmdbId = record?.data?.tmdbId || record?.data?.title?.id;

  useEffect(() => {
    if (!record || record.category_id !== 'video') return undefined;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: '' }));

    loadReactions(record, controller.signal)
      .then((payload) => {
        setState({
          loading: false,
          error: '',
          reactions: payload.reactions || [],
          averageRating: payload.averageRating || 0,
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ loading: false, error: getReactionError(error.status || 0, error.payload), reactions: [], averageRating: 0 });
      });

    return () => controller.abort();
  }, [record, tmdbId]);

  if (!record || record.category_id !== 'video') return null;

  return (
    <section className="friend-reactions">
      <div className="section-title compact-section-title">
        <div>
          <p className="eyebrow">Friends</p>
          <h3>친구들의 반응</h3>
        </div>
        {state.averageRating > 0 && <span>평균 {state.averageRating.toFixed(1)}</span>}
      </div>

      {state.loading && <p className="muted">친구 기록을 확인하는 중입니다.</p>}
      {state.error && <p className="form-error">{state.error}</p>}
      {!state.loading && !state.error && state.reactions.length === 0 && (
        <p className="empty-text compact-empty">아직 이 작품을 기록한 친구가 없어요.</p>
      )}

      <div className="reaction-list">
        {state.reactions.slice(0, 5).map((reaction) => (
          <article className="reaction-card" key={reaction.id}>
            <div>
              <strong>{reaction.displayName || '친구'}</strong>
              <span>{reaction.period || reaction.occurredOn || '날짜 없음'}</span>
            </div>
            <b>{Number(reaction.rating || 0).toFixed(1)}</b>
            {reaction.memo && <p>{reaction.memo}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
