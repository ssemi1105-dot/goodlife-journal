import JapanesePhrase from './JapanesePhrase';
import TutorExpressionTips from './TutorExpressionTips';

const errorLabels = { particle: '조사', verb_form: '동사 표현', word_choice: '단어', word_order: '어순', politeness: '말투', other: '표현' };

export default function JapaneseFeedback({ feedback, speak, practice, disabled, reply = true }) {
  const hasTips = Boolean(feedback.natural && feedback.expression_tips?.length);
  return <div className="japanese-feedback">
    {feedback.natural && <section className="japanese-coaching">
      <JapanesePhrase phrase={feedback.natural} label={hasTips ? '이럴 땐 이렇게 말해요' : '이렇게 말해보세요'} onSpeak={speak} disabled={disabled} />
      <p className="tutor-note">{feedback.natural.explanation_ko}</p>
      {hasTips && <TutorExpressionTips tips={feedback.expression_tips} language="ja" />}
      {practice && <div className="tutor-expression-actions"><button type="button" disabled={disabled} onClick={() => practice(feedback.natural)}>{hasTips ? '이 표현으로 연습하기' : '따라 말하기'}</button></div>}
    </section>}
    {!!feedback.errors?.length && <ul className="japanese-corrections">{feedback.errors.map((error, index) => <li key={index}><span>{errorLabels[error.type] || '표현'}</span>{error.explanation_ko}</li>)}</ul>}
    {reply && <JapanesePhrase phrase={feedback.reply_reading} label="HARU" onSpeak={speak} disabled={disabled} />}
  </div>;
}
