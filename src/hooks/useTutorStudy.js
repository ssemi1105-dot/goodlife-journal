import { useCallback, useEffect, useRef, useState } from 'react';

export function useTutorStudy(userId, language, call, enabled) {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), lock = useRef(false), pendingGrades = useRef(new Map());
  const reload = useCallback(async () => {
    const ticket = generation.current;
    setLoading(true);
    try {
      const result = await call('study-list');
      if (!Array.isArray(result.items)) throw new Error('복습 기능의 SQL 적용과 튜터 서버 재배포가 필요합니다.');
      if (ticket === generation.current) { setItems(result.items); setError(''); }
    } catch (err) {
      if (ticket === generation.current) setError(['SETUP_REQUIRED', 'INVALID_INPUT'].includes(err.code) ? '복습 기능의 SQL 적용과 영어·일본어 튜터 서버 재배포가 필요합니다.' : err.message);
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [call]);
  useEffect(() => {
    generation.current++; setItems([]); setError('');
    if (enabled) reload();
    return () => { generation.current++; };
  }, [userId, language, enabled, reload]);
  async function update(action, payload) {
    if (lock.current) return false;
    const ticket = generation.current;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await call(action, payload);
      if (action === 'study-delete') {
        if (!result.ok) throw new Error('표현 삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요.');
        if (ticket === generation.current) setItems(current => current.filter(item => item.id !== payload.itemId));
        return true;
      }
      if (!result.item?.id) throw new Error('복습 저장 결과를 확인하지 못했습니다. 서버 업데이트를 확인해 주세요.');
      if (ticket === generation.current) setItems(current => [...current.filter(item => item.id !== result.item.id), result.item]);
      return true;
    } catch (err) {
      if (ticket === generation.current) setError(['SETUP_REQUIRED', 'INVALID_INPUT'].includes(err.code) ? '복습 기능의 SQL 적용과 튜터 서버 재배포가 필요합니다.' : err.message);
      return false;
    } finally { lock.current = false; if (ticket === generation.current) setBusy(false); }
  }
  return { items, loading, busy, error, reload,
    saved: key => items.some(item => item.source_key === key),
    save: payload => update('study-save', payload),
    remove: itemId => update('study-delete', { itemId }),
    grade: async (itemId, grade) => {
      if (lock.current) return false;
      const key = `goodlife-study-review-${userId}-${language}-${itemId}`;
      let pending = pendingGrades.current.get(key);
      try { pending ||= JSON.parse(sessionStorage.getItem(key)); } catch { /* Keep the in-memory retry ID. */ }
      // A lost response must use the same event ID, not advance the schedule twice.
      if (pending && pending.grade !== grade) {
        setError('이전 복습 저장 결과가 불확실합니다. 먼저 같은 평가 버튼을 다시 눌러 확인해 주세요.');
        return false;
      }
      if (!pending) pending = { requestId: crypto.randomUUID(), grade };
      pendingGrades.current.set(key, pending);
      try { sessionStorage.setItem(key, JSON.stringify(pending)); } catch { /* The current request remains usable. */ }
      const success = await update('study-grade', { itemId, ...pending });
      if (success) { pendingGrades.current.delete(key); try { sessionStorage.removeItem(key); } catch { /* Optional local storage. */ } }
      return success;
    },
  };
}
