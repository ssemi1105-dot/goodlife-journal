export function japaneseFeedback(content = 'コーヒーをください。') {
  return { spec_version: '1.0',
    tutor_reply: { sentence: '温かいコーヒーですか。', reading_kana: 'あたたかいこーひーですか。', pronunciation_ko: '아타타카이 코오히이데스카.', meaning_ko: '따뜻한 커피인가요?' },
    natural: content.includes('커피') ? { sentence: 'コーヒーを一つください。', reading_kana: 'こーひーをひとつください。', pronunciation_ko: '코오히이오 히토츠 쿠다사이.', meaning_ko: '커피 하나 주세요.', explanation_ko: '주문할 때 사용할 수 있는 공손한 표현입니다.' } : null,
    errors: [], flags: { stt_suspected: false, meaning_unclear: false, sensitive: false }, memory: '카페에서 커피를 주문하는 연습.' };
}
