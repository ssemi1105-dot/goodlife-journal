import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminUserList({ enabled }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !supabase) return undefined;
    let mounted = true;
    setLoading(true);
    setError('');
    supabase.functions.invoke('admin-list-users')
      .then(({ data, error: invokeError }) => {
        if (!mounted) return;
        if (invokeError) throw invokeError;
        setUsers(data?.users || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || '회원 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <section className="settings-panel admin-panel">
      <div className="section-title compact-section-title">
        <h2>회원관리</h2>
        <span>{users.length}명</span>
      </div>
      {loading && <p className="muted">회원 목록을 불러오는 중입니다.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="admin-user-list">
        {users.map((user) => (
          <article key={user.id}>
            <strong>{user.displayName || '사용자'}</strong>
            <span>{user.email || '이메일 비공개'}</span>
            <small>{user.role || 'member'} · {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '가입일 미상'}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
