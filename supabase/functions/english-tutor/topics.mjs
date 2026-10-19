// Shared public lesson content only. Never put provider configuration here.
export const TUTOR_TOPICS = [
  { id: 'daily', label: '오늘 하루', situation: '오늘 있었던 일', role: '친구와 대화', questions: [
    'What did you do today?',
    'What was the best part of your day, and why?',
    'If you could change one thing about today, what would you change?'
  ] },
  { id: 'restaurant', label: '식당', situation: '메뉴 추천과 주문', role: '나는 손님, Mina는 직원', questions: [
    'Welcome! What would you like to eat?',
    'Welcome! Are you looking for something light or a bigger meal?',
    'What kind of meal would suit your evening, and are there any ingredients you avoid?'
  ] },
  { id: 'cafe', label: '카페', situation: '음료와 옵션 주문', role: '나는 손님, Mina는 바리스타', questions: [
    'Hi! What would you like to drink?',
    'What can I get for you, and would you like it hot or iced?',
    'What kind of coffee do you usually enjoy, and would you like to try something different?'
  ] },
  { id: 'travel', label: '여행', situation: '여행 계획 세우기', role: '함께 여행을 계획하는 친구', questions: [
    'Where would you like to travel?',
    'Where would you like to go on your next trip, and why?',
    'How would you balance sightseeing and relaxation on your ideal trip?'
  ] },
  { id: 'hotel', label: '호텔', situation: '체크인과 요청', role: '나는 투숙객, Mina는 직원', questions: [
    'Welcome! How many nights would you like to stay?',
    'Welcome! What kind of room are you looking for?',
    'What matters most to you when choosing a room for this stay?'
  ] },
  { id: 'shopping', label: '쇼핑', situation: '물건 찾기와 교환', role: '나는 손님, Mina는 직원', questions: [
    'Hello! What are you looking for today?',
    'Are you shopping for yourself or looking for a gift?',
    'What features are most important to you in the item you are looking for?'
  ] },
  { id: 'work', label: '직장', situation: '업무와 일정 이야기', role: '동료와 대화', questions: [
    'What are you working on today?',
    'What task would you like to finish this week?',
    'How do you decide what to do first when several tasks are urgent?'
  ] },
  { id: 'smalltalk', label: '스몰토크', situation: '처음 만난 사람과 인사', role: '처음 만난 이웃', questions: [
    'Nice to meet you! What do you like to do on weekends?',
    'Have you tried anything new recently?',
    'What is something you have enjoyed recently that you would recommend to someone new here?'
  ] },
  { id: 'movies', label: '영화·드라마', situation: '좋아하는 작품 소개', role: '작품을 추천하는 친구', questions: [
    'What movie or TV show do you like?',
    'What did you enjoy about the last movie or show you watched?',
    'What makes a character memorable to you, and can you give an example?'
  ] },
  { id: 'hobbies', label: '취미', situation: '좋아하는 활동 설명', role: '취미를 알아가는 친구', questions: [
    'What do you like to do in your free time?',
    'How did you become interested in your favorite hobby?',
    'How has your favorite hobby changed the way you spend your free time?'
  ] },
  { id: 'opinions', label: '의견 말하기', situation: '선택과 이유 설명', role: '서로의 생각을 듣는 친구', questions: [
    'Do you like staying home or going out?',
    'Would you rather spend a free day at home or outside, and why?',
    'Do you think planning a day carefully is better than being spontaneous? Why?'
  ] },
  { id: 'interview', label: '면접', situation: '경험과 강점 소개', role: '나는 지원자, Mina는 면접관', questions: [
    'Could you tell me about something you do well?',
    'Could you describe a task you completed successfully?',
    'Can you describe a challenging situation and explain how you handled it?'
  ] },
];

export function getTutorTopic(topicId) {
  return TUTOR_TOPICS.find(topic => topic.id === topicId) || null;
}

export function makeTopicOpening(topicId, level = 'A2') {
  const topic = getTutorTopic(topicId);
  if (!topic) return null;
  const index = Math.max(0, ['A2', 'B1', 'B1+'].indexOf(level));
  return { question: topic.questions[index], situation: topic.situation, role: topic.role, level: ['A2', 'B1', 'B1+'][index] };
}
