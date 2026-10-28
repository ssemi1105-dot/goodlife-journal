export default function JapanesePhrase({ phrase, onSpeak, onPractice, disabled = false, label }) {
  if (!phrase) return null;
  return <div className="japanese-phrase">
    {label && <h3>{label}</h3>}
    <p className="japanese-sentence" lang="ja">{phrase.sentence}</p>
    {phrase.pronunciation_ko ? <p className="japanese-reading" lang="ko"><span>한글 발음</span>{phrase.pronunciation_ko}</p> : <p className="tutor-note">한글 발음을 받지 못했어요. 일본어 듣기를 이용해 주세요.</p>}
    {phrase.meaning_ko && <details className="japanese-kana"><summary>뜻 보기</summary><p lang="ko">{phrase.meaning_ko}</p></details>}
    {phrase.reading_kana && <details className="japanese-kana"><summary>가나 읽기</summary><p lang="ja">{phrase.reading_kana}</p></details>}
    {(onSpeak || onPractice) && <div className="tutor-expression-actions">
      {onSpeak && <button type="button" className="tutor-icon" aria-label={`${label || '문장'} 듣기`} title="일본어 듣기" disabled={disabled} onClick={() => onSpeak(phrase.sentence)}>▷</button>}
      {onPractice && <button type="button" disabled={disabled} onClick={() => onPractice(phrase)}>따라 말하기</button>}
    </div>}
  </div>;
}
