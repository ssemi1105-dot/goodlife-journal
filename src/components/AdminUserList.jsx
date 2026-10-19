import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabaseClient';
import { callTutor, callJapaneseTutor } from '../services/tutorClient';
import { useTutorAdmin } from '../hooks/useTutorAdmin';
import CompactToggle from './ui/CompactToggle';
import TutorUsageSummary, { TutorUsageNote, totalTutorUsage } from './TutorUsageSummary';

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

export default function AdminUserList({ enabled, embedded = false }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { tutorAccess, tutorError, savingIds, accessLoading, tutorUsage, loadTutorAccess, setTutorPermission } = useTutorAdmin(enabled && !!supabase, callTutor);
  const japanese = useTutorAdmin(enabled && !!supabase, callJapaneseTutor);

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

  const content = (
    <>
      {loading && <p className="muted">회원 목록을 확인하는 중입니다.</p>}
      {error && <p className="form-error">{error}</p>}
      {tutorError && <p className="form-error" role="alert">{tutorError} <button type="button" className="secondary-button compact" disabled={accessLoading || !!savingIds.length} onClick={loadTutorAccess}>다시 확인</button></p>}
      {accessLoading && <p className="muted" role="status">튜터 권한·사용량 확인 중</p>}
      <section className="admin-tutor-usage" aria-label="전체 회원 튜터 사용량" aria-busy={accessLoading}>
        <div className="admin-tutor-usage-heading"><h3>영어 튜터 전체 사용량</h3><button type="button" className="icon-button" title="사용량 새로고침" aria-label="사용량 새로고침" disabled={accessLoading || !!savingIds.length} onClick={loadTutorAccess}>↻</button></div>
        <TutorUsageSummary usage={tutorUsage ? totalTutorUsage(tutorUsage.users) : null} />
        <TutorUsageNote />
      </section>
      <section className="admin-tutor-usage admin-japanese-usage" aria-label="전체 회원 일본어 사용량" aria-busy={japanese.accessLoading}>
        <div className="admin-tutor-usage-heading"><h3>일본어 튜터 전체 사용량</h3><button type="button" className="icon-button" title="일본어 사용량 새로고침" aria-label="일본어 사용량 새로고침" disabled={japanese.accessLoading || !!japanese.savingIds.length} onClick={japanese.loadTutorAccess}>↻</button></div>
        {japanese.tutorError && <p className="form-error" role="alert">{japanese.tutorError}</p>}
        <TutorUsageSummary usage={japanese.tutorUsage ? totalTutorUsage(japanese.tutorUsage.users) : null} />
      </section>

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
            <div className="admin-tutor-access">
              <CompactToggle label="영어 튜터" checked={tutorAccess?.[user.id]?.enabled === true}
                disabled={!tutorAccess || accessLoading || !!savingIds.length}
                onChange={value => setTutorPermission(user.id, value)} />
              <small role="status">{savingIds.includes(user.id) ? '저장 중' : !tutorAccess ? '연결 필요' : tutorAccess[user.id]?.enabled ? '허용 · 일일 제한 없음' : '사용 안 함'}</small>
            </div>
            <TutorUsageSummary compact usage={tutorUsage ? tutorUsage.users.find(item => item.user_id === user.id) || totalTutorUsage() : null} />
            <div className="admin-tutor-access admin-japanese-access">
              <CompactToggle label="일본어 튜터" checked={japanese.tutorAccess?.[user.id]?.enabled === true}
                disabled={!japanese.tutorAccess || japanese.accessLoading || !!japanese.savingIds.length}
                onChange={value => japanese.setTutorPermission(user.id, value)} />
              <small role="status">{japanese.savingIds.includes(user.id) ? '저장 중' : !japanese.tutorAccess ? '연결 필요' : japanese.tutorAccess[user.id]?.enabled ? '허용 · 일일 제한 없음' : '사용 안 함'}</small>
            </div>
            <div className="admin-japanese-user-usage"><TutorUsageSummary compact usage={japanese.tutorUsage ? japanese.tutorUsage.users.find(item => item.user_id === user.id) || totalTutorUsage() : null} /></div>
          </article>
        ))}
      </div>
    </>
  );

  if (embedded) return <div className="admin-panel embedded-settings-content">{content}</div>;

  return (
    <section className="settings-panel admin-panel">
      <div className="section-title compact-section-title">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>회원관리</h2>
        </div>
        <span>{users.length}명</span>
      </div>
      {content}
    </section>
  );
}
