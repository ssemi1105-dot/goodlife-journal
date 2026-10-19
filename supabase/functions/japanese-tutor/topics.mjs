export const LEVELS = ['starter', 'beginner', 'conversation'];
export const LEVEL_LABELS = { starter: '처음 시작', beginner: '기초 회화', conversation: '일상 회화' };
const phrase = (sentence, reading_kana, pronunciation_ko, meaning_ko) => ({ sentence, reading_kana, pronunciation_ko, meaning_ko });

export const JAPANESE_TOPICS = [
  { id: 'introductions', label: '인사·자기소개', situation: '처음 만난 사람에게 인사하기', role: '처음 만난 일본인 친구',
    question: phrase('お名前は何ですか。', 'おなまえはなんですか。', '오나마에와 난데스카.', '이름이 무엇인가요?'),
    example: phrase('パクです。よろしくお願いします。', 'ぱくです。よろしくおねがいします。', '파쿠데스. 요로시쿠 오네가이시마스.', '박입니다. 잘 부탁드립니다.') },
  { id: 'cafe', label: '카페', situation: '카페에서 음료 주문하기', role: '카페 직원',
    question: phrase('何を飲みますか。', 'なにをのみますか。', '나니오 노미마스카.', '무엇을 마시겠어요?'),
    example: phrase('コーヒーを一つください。', 'こーひーをひとつください。', '코오히이오 히토츠 쿠다사이.', '커피 하나 주세요.') },
  { id: 'restaurant', label: '식당', situation: '함께 먹을 음식 고르기', role: '함께 식사하는 친구',
    question: phrase('何を食べたいですか。', 'なにをたべたいですか。', '나니오 타베타이데스카.', '무엇을 먹고 싶어요?'),
    example: phrase('ラーメンを食べたいです。', 'らーめんをたべたいです。', '라아멘오 타베타이데스.', '라면을 먹고 싶어요.') },
  { id: 'shopping', label: '쇼핑', situation: '매장에서 필요한 물건 찾기', role: '매장 직원',
    question: phrase('何を探していますか。', 'なにをさがしていますか。', '나니오 사가시테이마스카.', '무엇을 찾고 계세요?'),
    example: phrase('白いシャツを探しています。', 'しろいしゃつをさがしています。', '시로이 샤츠오 사가시테이마스.', '흰 셔츠를 찾고 있어요.') },
  { id: 'directions', label: '길 찾기', situation: '길에서 목적지 물어보기', role: '길을 안내하는 사람',
    question: phrase('どこに行きたいですか。', 'どこにいきたいですか。', '도코니 이키타이데스카.', '어디에 가고 싶어요?'),
    example: phrase('駅に行きたいです。', 'えきにいきたいです。', '에키니 이키타이데스.', '역에 가고 싶어요.') },
  { id: 'hotel', label: '호텔', situation: '호텔에서 체크인하기', role: '호텔 프런트 직원',
    question: phrase('予約していますか。', 'よやくしていますか。', '요야쿠 시테이마스카.', '예약하셨나요?'),
    example: phrase('はい、予約しています。', 'はい、よやくしています。', '하이, 요야쿠 시테이마스.', '네, 예약했어요.') },
  { id: 'transport', label: '교통', situation: '역에서 목적지 말하기', role: '역 안내 직원',
    question: phrase('どこまで行きますか。', 'どこまでいきますか。', '도코마데 이키마스카.', '어디까지 가세요?'),
    example: phrase('東京駅までお願いします。', 'とうきょうえきまでおねがいします。', '토오쿄오에키마데 오네가이시마스.', '도쿄역까지 부탁합니다.') },
  { id: 'convenience', label: '편의점', situation: '편의점에서 계산하기', role: '편의점 직원',
    question: phrase('袋は要りますか。', 'ふくろはいりますか。', '후쿠로와 이리마스카.', '봉투가 필요한가요?'),
    example: phrase('袋はいりません。', 'ふくろはいりません。', '후쿠로와 이리마센.', '봉투는 필요 없어요.') },
  { id: 'daily', label: '오늘 하루', situation: '오늘 있었던 일 이야기하기', role: '일상을 나누는 친구',
    question: phrase('今日は何をしましたか。', 'きょうはなにをしましたか。', '쿄오와 나니오 시마시타카.', '오늘 무엇을 했어요?'),
    example: phrase('今日は仕事をしました。', 'きょうはしごとをしました。', '쿄오와 시고토오 시마시타.', '오늘 일을 했어요.') },
  { id: 'travel', label: '여행', situation: '여행에서 하고 싶은 일 이야기하기', role: '여행 이야기를 나누는 친구',
    question: phrase('日本で何をしたいですか。', 'にほんでなにをしたいですか。', '니혼데 나니오 시타이데스카.', '일본에서 무엇을 하고 싶어요?'),
    example: phrase('おいしい料理を食べたいです。', 'おいしいりょうりをたべたいです。', '오이시이 료오리오 타베타이데스.', '맛있는 음식을 먹고 싶어요.') },
];

export const getTutorTopic = id => JAPANESE_TOPICS.find(topic => topic.id === id) || null;
export function makeTopicOpening(id, level = 'starter') {
  const topic = getTutorTopic(id);
  if (!topic) return null;
  return { question: topic.question.sentence, question_reading: topic.question, example: topic.example,
    situation: topic.situation, role: topic.role, level: LEVELS.includes(level) ? level : 'starter' };
}
