import { ArrowRight } from 'lucide-react';

export default function TutorExpressionTips({ tips, language = 'en' }) {
  if (!tips?.length) return null;
  return <ul className="tutor-expression-tips" aria-label="상황별 표현 설명">
    {tips.slice(0, 2).map((tip, index) => <li key={index}>
      <div className="tutor-expression-mapping">
        <span lang="ko">{tip.source}</span><ArrowRight size={14} aria-hidden="true" />
        <strong lang={language}>{tip.sentence}</strong>
      </div>
      {language === 'ja' && tip.pronunciation_ko && <p className="tutor-tip-reading" lang="ko"><span>한글 발음</span> {tip.pronunciation_ko}</p>}
      <p lang="ko">{tip.explanation_ko}</p>
      {language === 'ja' && tip.reading_kana && <details className="japanese-kana"><summary>표현 읽기·뜻</summary><p lang="ja">{tip.reading_kana}</p><p lang="ko">{tip.meaning_ko}</p></details>}
    </li>)}
  </ul>;
}
