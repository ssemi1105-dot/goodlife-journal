import { TUTOR_TOPICS } from './topics.mjs';
import { JAPANESE_TOPICS } from '../japanese-tutor/topics.mjs';

// Original starter materials. Shared by the screen and server-side expression saving.
const english = {
  daily: [['I had a busy day.', '바쁜 하루를 보냈어요.'], ['I took a short walk.', '잠깐 산책했어요.'], ['Tomorrow, I want to rest.', '내일은 쉬고 싶어요.']],
  restaurant: [['Could I see the menu, please?', '메뉴를 볼 수 있을까요?'], ['I would like the chicken soup.', '닭고기 수프로 주세요.'], ['Could we have the bill, please?', '계산서 부탁드려요.']],
  cafe: [['A small tea, please.', '작은 차 한 잔 주세요.'], ['Could I have it without sugar?', '설탕 없이 받을 수 있을까요?'], ['I will drink it here.', '여기서 마실게요.']],
  travel: [['I would like to visit Kyoto.', '교토에 가 보고 싶어요.'], ['I want to stay for three days.', '3일 동안 머물고 싶어요.'], ['I enjoy walking around new places.', '새로운 곳을 걸어 다니는 것을 좋아해요.']],
  hotel: [['I have a reservation for two nights.', '2박 예약했어요.'], ['Is breakfast included?', '아침 식사가 포함되어 있나요?'], ['Could I have an extra towel?', '수건을 하나 더 받을 수 있을까요?']],
  shopping: [['I am looking for a jacket.', '재킷을 찾고 있어요.'], ['Do you have a smaller size?', '더 작은 사이즈가 있나요?'], ['May I try it on?', '입어 봐도 될까요?']],
  work: [['I am working on a report.', '보고서를 작성하고 있어요.'], ['Could you check this part?', '이 부분을 확인해 주시겠어요?'], ['I can finish it by Friday.', '금요일까지 마칠 수 있어요.']],
  smalltalk: [['I recently moved here.', '최근에 이곳으로 이사 왔어요.'], ['I enjoy cooking on weekends.', '주말에 요리하는 것을 좋아해요.'], ['What do you like to do?', '무엇을 하는 걸 좋아하세요?']],
  movies: [['I watched a comedy last night.', '어젯밤에 코미디를 봤어요.'], ['The ending was surprising.', '결말이 놀라웠어요.'], ['I would recommend it to a friend.', '친구에게 추천하고 싶어요.']],
  hobbies: [['I like taking photos.', '사진 찍는 걸 좋아해요.'], ['I started last year.', '작년에 시작했어요.'], ['It helps me relax.', '마음을 편하게 해 줘요.']],
  opinions: [['I prefer staying at home.', '집에 있는 걸 더 좋아해요.'], ['It gives me time to rest.', '쉴 시간을 주기 때문이에요.'], ['What do you think?', '어떻게 생각하세요?']],
  interview: [['I am good at organizing tasks.', '저는 일을 정리하는 데 능숙해요.'], ['I worked closely with my team.', '팀과 긴밀하게 협력했어요.'], ['I learned to ask for help early.', '일찍 도움을 요청하는 법을 배웠어요.']],
};
const japanese = {
  introductions: [['韓国から来ました。', 'かんこくからきました。', '칸코쿠카라 키마시타.', '한국에서 왔어요.'], ['日本語を勉強しています。', 'にほんごをべんきょうしています。', '니혼고오 벤쿄오 시테이마스.', '일본어를 공부하고 있어요.']],
  cafe: [['温かい紅茶をお願いします。', 'あたたかいこうちゃをおねがいします。', '아타타카이 코오차오 오네가이시마스.', '따뜻한 홍차 부탁해요.'], ['砂糖は入れないでください。', 'さとうはいれないでください。', '사토오와 이레나이데 쿠다사이.', '설탕은 넣지 말아 주세요.']],
  restaurant: [['おすすめは何ですか。', 'おすすめはなんですか。', '오스스메와 난데스카.', '추천 메뉴는 무엇인가요?'], ['辛くない料理はありますか。', 'からくないりょうりはありますか。', '카라쿠나이 료오리와 아리마스카.', '맵지 않은 음식이 있나요?']],
  shopping: [['試着してもいいですか。', 'しちゃくしてもいいですか。', '시차쿠 시테모 이이데스카.', '입어 봐도 될까요?'], ['もう少し小さいサイズはありますか。', 'もうすこしちいさいさいずはありますか。', '모오 스코시 치이사이 사이즈와 아리마스카.', '조금 더 작은 사이즈가 있나요?']],
  directions: [['ここから歩けますか。', 'ここからあるけますか。', '코코카라 아루케마스카.', '여기서 걸어갈 수 있나요?'], ['地図で教えてください。', 'ちずでおしえてください。', '치즈데 오시에테 쿠다사이.', '지도로 알려 주세요.']],
  hotel: [['二泊の予約です。', 'にはくのよやくです。', '니하쿠노 요야쿠데스.', '2박 예약이에요.'], ['朝食は何時からですか。', 'ちょうしょくはなんじからですか。', '초오쇼쿠와 난지카라데스카.', '아침 식사는 몇 시부터인가요?']],
  transport: [['この電車は京都に行きますか。', 'このでんしゃはきょうとにいきますか。', '코노 덴샤와 쿄오토니 이키마스카.', '이 전철은 교토에 가나요?'], ['何番ホームですか。', 'なんばんほーむですか。', '난반 호오무데스카.', '몇 번 승강장인가요?']],
  convenience: [['温めてください。', 'あたためてください。', '아타타메테 쿠다사이.', '데워 주세요.'], ['カードで払えますか。', 'かーどではらえますか。', '카아도데 하라에마스카.', '카드로 결제할 수 있나요?']],
  daily: [['少し疲れました。', 'すこしつかれました。', '스코시 츠카레마시타.', '조금 피곤했어요.'], ['明日はゆっくり休みたいです。', 'あしたはゆっくりやすみたいです。', '아시타와 윳쿠리 야스미타이데스.', '내일은 푹 쉬고 싶어요.']],
  travel: [['海を見に行きたいです。', 'うみをみにいきたいです。', '우미오 미니 이키타이데스.', '바다를 보러 가고 싶어요.'], ['写真を撮ってもいいですか。', 'しゃしんをとってもいいですか。', '샤신오 톳테모 이이데스카.', '사진을 찍어도 될까요?']],
};
const hints = {
  daily: ['오늘 한 일을 하나 골라 말해 보세요.', '그때 기분이나 이유를 짧게 덧붙여 보세요.', '내일 하고 싶은 일을 하나 말해 보세요.'],
  restaurant: ['먹고 싶은 메뉴를 하나 골라 주문해 보세요.', '맵기나 함께 주문할 음식을 말해 보세요.', '계산서를 부탁하며 마무리해 보세요.'],
  cafe: ['마시고 싶은 음료를 한 잔 주문해 보세요.', '크기, 온도, 설탕 중 하나를 선택해 보세요.', '매장에서 마실지 포장할지 말해 보세요.'],
  travel: ['가 보고 싶은 장소를 말해 보세요.', '며칠 동안 머물고 싶은지 덧붙여 보세요.', '그곳에서 하고 싶은 일을 하나 말해 보세요.'],
  hotel: ['예약이 있다고 말하며 체크인을 시작해 보세요.', '숙박 일수나 필요한 물품을 말해 보세요.', '아침 식사 시간처럼 궁금한 것을 물어보세요.'],
  shopping: ['찾는 물건을 하나 말해 보세요.', '색상이나 크기를 바꾸어 요청해 보세요.', '입어 봐도 되는지 물어보세요.'],
  work: ['지금 하고 있는 일을 간단히 말해 보세요.', '도움이 필요한 부분을 부탁해 보세요.', '언제까지 마칠 수 있는지 말해 보세요.'],
  smalltalk: ['자신에 대해 한 가지 소개해 보세요.', '좋아하는 활동을 하나 덧붙여 보세요.', '상대방에게도 같은 질문을 해 보세요.'],
  movies: ['최근 본 작품이나 장르를 말해 보세요.', '기억나는 장면이나 느낀 점을 말해 보세요.', '누구에게 추천하고 싶은지 말해 보세요.'],
  hobbies: ['즐기는 활동을 하나 말해 보세요.', '언제 시작했거나 얼마나 자주 하는지 말해 보세요.', '그 활동을 좋아하는 이유를 덧붙여 보세요.'],
  opinions: ['어느 쪽을 더 좋아하는지 골라 보세요.', '그렇게 생각하는 이유를 하나 말해 보세요.', '상대방의 생각도 물어보세요.'],
  interview: ['자신의 강점을 하나 말해 보세요.', '그 강점을 사용했던 경험을 짧게 말해 보세요.', '그 경험에서 배운 것을 덧붙여 보세요.'],
  introductions: ['이름이나 어디에서 왔는지 소개해 보세요.', '지금 공부하는 것을 하나 말해 보세요.', '상대방에 대해 궁금한 것을 물어보세요.'],
  directions: ['가고 싶은 장소가 어디인지 물어보세요.', '걸어서 갈 수 있는지 확인해 보세요.', '지도로 알려 달라고 부탁해 보세요.'],
  transport: ['가려는 목적지를 말해 보세요.', '이 교통편이 그곳에 가는지 물어보세요.', '승강장이나 출발 시간을 확인해 보세요.'],
  convenience: ['살 물건을 골라 계산을 부탁해 보세요.', '데우기나 봉투가 필요한지 말해 보세요.', '카드로 결제할 수 있는지 물어보세요.'],
};

export function getStudyLesson(language, topicId) {
  const topic = (language === 'ja' ? JAPANESE_TOPICS : TUTOR_TOPICS).find(item => item.id === topicId);
  if (!topic) return null;
  const phrases = language === 'ja' ? [topic.example, ...japanese[topicId].map(([sentence, reading_kana, pronunciation_ko, meaning_ko]) => ({ sentence, reading_kana, pronunciation_ko, meaning_ko }))]
    : english[topicId].map(([sentence, meaning_ko]) => ({ sentence, meaning_ko }));
  return { id: topicId, title: topic.label, goal: topic.situation, phrases: phrases.map((phrase, index) => ({ ...phrase, id: String(index) })), hints: hints[topicId] };
}

export function expressionFromTurn(turn, kind = 'practice') {
  if (kind === 'reply') {
    const value = turn.feedback?.reply_reading || turn.feedback?.tutor_reply;
    return typeof value === 'string' ? { sentence: value } : typeof value?.sentence === 'string' ? value : null;
  }
  const feedback = turn.feedback || {};
  return feedback.natural || (feedback.english_version ? { sentence: feedback.english_version } : feedback.errors?.length ? { sentence: feedback.corrected } : null);
}
