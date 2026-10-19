export function japaneseFeedback(content = 'コーヒーをください。') {
  if (content === 'コーヒーを 두 잔 주세요') return { ...japaneseFeedback(),
    natural: { sentence: 'コーヒーを二杯ください。', reading_kana: 'こーひーをにはいください。', pronunciation_ko: '코오히이오 니하이 쿠다사이.', meaning_ko: '커피 두 잔 주세요.', explanation_ko: '수량을 넣어 공손하게 주문하는 표현입니다.' },
    expression_tips: [{ source: '두 잔', sentence: '二杯', reading_kana: 'にはい', pronunciation_ko: '니하이', meaning_ko: '두 잔', explanation_ko: '음료 두 잔은 二杯라고 해요. コーヒーを는 그대로 두고 수량을 붙이면 돼요.' }] };
  return { spec_version: '1.0',
    tutor_reply: { sentence: '温かいコーヒーですか。', reading_kana: 'あたたかいこーひーですか。', pronunciation_ko: '아타타카이 코오히이데스카.', meaning_ko: '따뜻한 커피인가요?' },
    natural: content.includes('커피') ? { sentence: 'コーヒーを一つください。', reading_kana: 'こーひーをひとつください。', pronunciation_ko: '코오히이오 히토츠 쿠다사이.', meaning_ko: '커피 하나 주세요.', explanation_ko: '주문할 때 사용할 수 있는 공손한 표현입니다.' } : null,
    expression_tips: content === '커피 주세요' ? [{ source: '주세요', sentence: 'ください', reading_kana: 'ください', pronunciation_ko: '쿠다사이', meaning_ko: '주세요', explanation_ko: '물건을 부탁할 때 이름 뒤에 をください를 붙여요. 카페 주문에도 쓸 수 있어요.' }] : [],
    errors: [], flags: { stt_suspected: false, meaning_unclear: false, sensitive: false }, memory: '카페에서 커피를 주문하는 연습.' };
}
