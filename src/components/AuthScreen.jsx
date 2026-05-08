import { useState } from 'react';

export default function AuthScreen({ configured, onSignIn, onSignUp }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') await onSignIn(email, password);
      else await onSignUp(email, password, displayName);
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <h1>Goodlife Journal</h1>
          <p>Supabase 환경변수가 아직 설정되지 않았습니다. `.env`를 만들고 Supabase URL과 anon key를 넣어주세요.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Private life record</p>
          <h1>Goodlife Journal</h1>
          <p className="muted">개인 일상을 안전하게 기록하고, 나중에 친구들과 비교할 수 있게 확장되는 기록 앱입니다.</p>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label>
              이름
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="표시 이름" />
            </label>
          )}
          <label>
            이메일
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            비밀번호
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '처리 중' : mode === 'signin' ? '로그인' : '가입하기'}
          </button>
        </form>

        <button className="link-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? '처음 사용하시나요? 가입하기' : '이미 계정이 있나요? 로그인'}
        </button>
      </section>
    </main>
  );
}
