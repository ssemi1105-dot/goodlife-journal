import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabaseClient';

function describeAdminError(status, payload, error) {
  const serverMessage = payload?.error || error?.message || '';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return 'Supabase 연결 정보가 없습니다. VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 확인하세요.';
  }
  if (status === 401) return '로그인이 만료되었거나 인증 토큰이 없습니다. 다시 로그인한 뒤 시도해 주세요.';
  if (status === 403) return '관리자 권한이 없습니다. profiles.role이 owner 또는 admin인지 확인해 주세요.';
  if (status === 404) return 'admin-list-users Edge Function이 아직 배포되지 않았습니다.';
  if (status >= 500 && serverMessage.toLowerCase().includes('configured')) {
    return '서버 설정이 누락되었습니다. Edge Function secrets에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.';
  }
  if (status >= 500) return `회원관리 서버 오류입니다. ${serverMessage || 'Edge Function 로그를 확인해 주세요.'}`;
  if (status === 0) return 'Edge Function에 연결하지 못했습니다. 배포 상태, CORS, 네트워크 연결을 확인해 주세요.';
  return serverMessage || '회원 목록을 불러오지 못했습니다.';
}

async function fetchAdminUsers(signal) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const token = sessionData?.session?.access_token;
  if (!token) {
    const error = new Error('로그인이 필요합니다.');
    error.status = 401;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/admin-list-users`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
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
    const error = new Error(describeAdminError(response.status, payload));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload?.users || [];
}

export default function AdminUserList({ enabled }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !supabase) return undefined;

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchAdminUsers(controller.signal)
      .then((nextUsers) => {
        setUsers(nextUsers);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(describeAdminError(err.status || 0, err.payload, err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <section className="settings-panel admin-panel">
      <div className="section-title compact-section-title">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>회원관리</h2>
        </div>
        <span>{users.length}명</span>
      </div>

      {loading && <p className="muted">회원 목록을 확인하는 중입니다.</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <p className="empty-text">표시할 회원이 아직 없습니다.</p>
      )}

      <div className="admin-user-list">
        {users.map((user) => (
          <article key={user.id}>
            <strong>{user.displayName || '사용자'}</strong>
            <span>{user.email || '이메일 비공개'}</span>
            <small>
              {user.role || 'member'} · {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '가입일 미상'}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
