import { useState } from 'react';

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

export default function ShareSettingsPanel({ sharing, embedded = false }) {
  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);

  async function submitFriendRequest(event) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) return;
    setRequesting(true);
    try {
      await sharing.sendFriendRequest(nextEmail);
      setEmail('');
    } catch {
      // useSharing exposes a readable error message in this panel.
    } finally {
      setRequesting(false);
    }
  }

  const content = (
    <>
      <div className="settings-row strong-row compact-info-row">
        <div>
          <strong>친구 비교</strong>
          <span>카테고리별 공유는 카테고리 관리에서 조정합니다.</span>
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
        {sharing.friends.slice(0, 4).map((friend) => (
          <FriendRow key={friend.id} friend={friend} onRespond={sharing.respondToFriendship} />
        ))}
        {!sharing.loading && sharing.friends.length === 0 && (
          <p className="empty-text compact-empty">아직 연결된 친구가 없습니다.</p>
        )}
      </div>
    </>
  );

  if (embedded) return <div className="share-settings-panel embedded-settings-content">{content}</div>;

  return (
    <section className="settings-panel share-settings-panel">
      <div className="section-title compact-section-title">
        <div>
          <p className="eyebrow">Sharing</p>
          <h2>친구/공유</h2>
        </div>
        <span>{sharing.sharedCount}개 공유</span>
      </div>
      {content}
    </section>
  );
}
