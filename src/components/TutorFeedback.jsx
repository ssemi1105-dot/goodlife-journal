import TutorExpressionTips from './TutorExpressionTips';

export const ERROR_LABELS = { tense: '시제', verb_form: '동사 형태', article: '관사', plural: '복수형', preposition: '전치사', word_order: '어순', word_choice: '단어 선택', spelling: '철자', agreement: '수 일치', other: '기타' };

function CorrectionList({ errors }) {
  return <ul>{errors.map((error, index) => <li key={index}>
    <span className="tutor-error-type">{ERROR_LABELS[error.type] || '표현'}</span>
    <div className="tutor-correction-pair"><del lang="en">{error.original}</del><span aria-hidden="true">→</span><strong lang="en">{error.corrected}</strong></div>
    <p>{error.explanation_ko}</p>
  </li>)}</ul>;
}

export default function TutorFeedback({ feedback, onSpeak, onPractice, disabled = false, showReply = true }) {
  const errors = feedback.errors || [];
  const expression = feedback.natural?.sentence || feedback.english_version || (errors.length ? feedback.corrected : '');
  const hasTips = Boolean(feedback.english_version && feedback.expression_tips?.length);
  const label = hasTips ? '이럴 땐 이렇게 말해요' : feedback.natural ? '이렇게 말해보세요' : feedback.english_version ? '영어로 표현하면' : '문법 교정';
  return <div className="tutor-feedback">
    {showReply && <div className="tutor-answer"><span className="tutor-speaker">MINA</span><p lang="en">{feedback.tutor_reply}</p>
      {onSpeak && <button type="button" className="tutor-icon" title="영어 답변 듣기" aria-label="영어 답변 듣기" onClick={() => onSpeak(feedback.tutor_reply)}>▷</button>}
    </div>}
    {['partial', 'unavailable'].includes(feedback.coaching_status) && <p className="tutor-coaching-notice">대답은 저장됐습니다. 일부 학습 도움말은 표시하지 못했어요.</p>}
    {expression && <section className="tutor-expression">
      <h3>{label}</h3><p lang="en">{expression}</p>
      {feedback.natural?.explanation_ko && <div className="tutor-expression-note"><span>표현 제안</span> {feedback.natural.explanation_ko}</div>}
      {hasTips && <TutorExpressionTips tips={feedback.expression_tips} />}
      <div className="tutor-expression-actions">
        {onSpeak && <button type="button" className="tutor-icon" title="추천 문장 듣기" aria-label="추천 문장 듣기" onClick={() => onSpeak(expression)}>▷</button>}
        {onPractice && <button type="button" disabled={disabled} onClick={() => onPractice(expression)}>{hasTips ? '이 표현으로 연습하기' : '다시 말해보기'}</button>}
      </div>
    </section>}
    {!!errors.length && <section className="tutor-correction">
      <h3>핵심 교정</h3><CorrectionList errors={errors.slice(0, 3)} />
      {errors.length > 3 && <details><summary>교정 {errors.length - 3}개 더보기</summary><CorrectionList errors={errors.slice(3)} /></details>}
    </section>}
    {!!feedback.improvements?.length && <details className="tutor-improvements"><summary>다른 표현</summary>{feedback.improvements.map((item, index) => <div key={index}><p lang="en">{item.suggestion}</p><small>{item.reason_ko}</small></div>)}</details>}
    {feedback.flags?.stt_suspected && <p className="tutor-note">음성 인식이 불명확해 오류 평가에서 제외했습니다.</p>}
  </div>;
}
