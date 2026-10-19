import { useEffect, useRef, useState } from 'react';

export function useTutorAdmin(enabled, call) {
  const [tutorAccess, setTutorAccess] = useState(null), [tutorError, setTutorError] = useState('');
  const [savingIds, setSavingIds] = useState([]), [accessLoading, setAccessLoading] = useState(false), [tutorUsage, setTutorUsage] = useState(null);
  const active = useRef(false), saving = useRef(new Set()), accessLoad = useRef(0);
  async function loadTutorAccess() {
    const ticket = ++accessLoad.current;
    setAccessLoading(true); setTutorError('');
    try {
      const result = await call('admin-access-list');
      if (active.current && ticket === accessLoad.current) {
        setTutorAccess(Object.fromEntries(result.access.map(item => [item.user_id, item])));
        setTutorUsage(result.usage);
      }
    } catch (error) { if (active.current && ticket === accessLoad.current) setTutorError(error.message); }
    finally { if (active.current && ticket === accessLoad.current) setAccessLoading(false); }
  }
  async function setTutorPermission(userId, nextEnabled) {
    if (saving.current.size || accessLoading) return;
    saving.current.add(userId); setSavingIds([...saving.current]); setTutorError('');
    try {
      const result = await call('admin-set-access', { targetUserId: userId, enabled: nextEnabled });
      if (active.current) setTutorAccess(current => ({ ...current, [userId]: result.access }));
    } catch (error) {
      if (active.current) { await loadTutorAccess(); if (active.current) setTutorError(`${error.message} 현재 상태를 다시 확인해 주세요.`); }
    } finally { saving.current.delete(userId); if (active.current) setSavingIds([...saving.current]); }
  }
  useEffect(() => {
    active.current = enabled;
    if (enabled) loadTutorAccess();
    return () => { active.current = false; accessLoad.current++; };
  }, [enabled, call]);
  return { tutorAccess, tutorError, savingIds, accessLoading, tutorUsage, loadTutorAccess, setTutorPermission };
}
