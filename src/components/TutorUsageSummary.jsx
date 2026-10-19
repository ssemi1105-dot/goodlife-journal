import './TutorUsageSummary.css';

const emptyPeriod = () => ({ requests: 0, tokens: 0, unreported: 0 });
export function totalTutorUsage(users = []) {
  return users.reduce((sum, user) => {
    for (const period of ['today', 'total']) {
      for (const key of ['requests', 'tokens', 'unreported']) sum[period][key] += user[period][key];
    }
    return sum;
  }, { today: emptyPeriod(), total: emptyPeriod() });
}

export default function TutorUsageSummary({ usage, compact = false }) {
  if (!usage) return <p className="tutor-token-note" role="status">사용량을 아직 확인하지 못했습니다.</p>;
  return <dl className={`tutor-token-summary${compact ? ' is-compact' : ''}`}>
    {[['today', '오늘'], ['total', '누적']].map(([key, label]) => <div key={key}>
      <dt>{label} 확인된 토큰</dt>
      <dd><strong>{usage[key].tokens.toLocaleString('ko-KR')}</strong><span>토큰</span></dd>
      <dd className="tutor-token-detail">요청 {usage[key].requests.toLocaleString('ko-KR')}회
        {!!usage[key].unreported && <span>사용량 미확인 {usage[key].unreported.toLocaleString('ko-KR')}건</span>}
      </dd>
    </div>)}
  </dl>;
}

export function TutorUsageNote() {
  return <p className="tutor-token-note">한국 시간 기준 · Hive가 알려준 입력·출력 합계입니다. 미확인 요청(처리 중·실패·일부 이전 기록)은 토큰 합계에서 제외되어 실제 청구량과 다를 수 있습니다. 대화를 삭제해도 누적 사용량은 유지됩니다.</p>;
}
