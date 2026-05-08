import { useState } from 'react';
import { CATEGORIES } from '../data/categoryDefinitions';
import { useSharing } from '../hooks/useSharing';
import CompactToggle from './ui/CompactToggle';

function FriendRow({ friend, onRespond }) {
  const isIncoming = friend.direction === 'incoming' && friend.status === 'pending';
  const label = friend.displayName || friend.email || '사용자';

  return (
    <article className="friend-row">
      <div>
        <strong>{label}</strong>
        <span>{friend.email || friend.role || '프로필'}</span>
      </div>
      {isIncoming ? (
        <div className="friend-actions">
          <button type="button" className="secondary-button tiny" onClick={() => onRespond(friend.id, 'accepted')}>수락</button>
          <button type="button" className="ghost-button tiny" onClick={() => onRespond(friend.id, 'rejected')}>거절</button>
        </div>
      ) : (
        <small>{friend.status === 'accepted' ? '친구' : friend.direction === 'outgoing' ? '요청 보냄' : '대기 중'}</small>
      )}
    </article>
  );
}

export default function ShareSettingsPanel({ userId }) {
  const [email, setEmail] = useState('');
  const [savingCategory, setSavingCategory] = useState('');
  const [requesting, setRequesting] = useState(false);
  const sharing = useSharing(userId, CATEGORIES);

  async function toggleCategory(categoryId, checked) {
    setSavingCategory(categoryId);
    try {
      await sharing.setCategoryShared(categoryId, checked);
    } catch (error) {
      window.alert(error.message || '공유 설정 저장에 실패했습니다. Supabase schema.sql 적용 여부를 확인해 주세요.');
    } finally {
      setSavingCategory('');
    }
  }

  async function submitFriendRequest(event) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) return;
    setRequesting(true);
    try {
      await sharing.sendFriendRequest(nextEmail);
      setEmail('');
    } catch {
      // useSharing exposes a readable error message in the panel.
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="settings-panel share-settings-panel">
      <div className="section-title compact-section-title">
        <div>
          <p className="eyebrow">Sharing</p>
          <h2>공유 설정</h2>
        </div>
        <span>{sharing.sharedCount}개 공유 중</span>
      </div>

      <div className="settings-row strong-row">
        <div>
          <strong>친구 비교</strong>
          <span>친구로 연결되고, 서로 공유를 켠 카테고리만 비교됩니다.</span>
        </div>
      </div>

      <form className="friend-request-form" onSubmit={submitFriendRequest}>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="친구 이메일"
          inputMode="email"
          autoComplete="email"
        />
        <button type="submit" className="primary-button compact" disabled={requesting || !email.trim()}>
          요청
        </button>
      </form>

      {sharing.friendError && <p className="form-error">{sharing.friendError}</p>}

      <div className="friend-list">
        {sharing.friends.slice(0, 5).map((friend) => (
          <FriendRow key={friend.id} friend={friend} onRespond={sharing.respondToFriendship} />
        ))}
        {!sharing.loading && sharing.friends.length === 0 && (
          <p className="empty-text compact-empty">아직 연결된 친구가 없습니다.</p>
        )}
      </div>

      <div className="share-category-list">
        {CATEGORIES.map((category) => {
          const state = sharing.shareSettings[category.id] || {};
          const isVideo = category.id === 'video';
          return (
            <div className="settings-row share-category-row" key={category.id}>
              <div>
                <strong>{category.label}</strong>
                <span>{isVideo ? '같은 작품을 본 친구 반응 비교 가능' : '친구와 이 카테고리 기록 비교 준비'}</span>
              </div>
              <CompactToggle
                checked={Boolean(state.is_shared)}
                onChange={(checked) => toggleCategory(category.id, checked)}
                disabled={savingCategory === category.id}
                label={state.is_shared ? '공유' : '비공유'}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
