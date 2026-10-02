import { useState } from 'react';
import RecordCard from '../src/components/RecordCard';
import RecordDetailModal from '../src/components/RecordDetailModal';

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aP5kAAAAASUVORK5CYII=';
const samples = [
  { id: 'video', category_id: 'video', occurred_on: '2026-09-13', rating: 4.5,
    data: { title: '트로이', tmdbPosterUrl: photo, watchStatus: '시청완료', memo: '감독판' } },
  { id: 'meal-photo', category_id: 'workMeal', occurred_on: '2026-08-08', amount: 12000, rating: 4, photoUrl: photo,
    weather_label: '강한 비', temperature_max: 27.2,
    data: { restaurant: '국민한우집', menuItems: [{ name: '한우국밥', amount: 12000 }], memo: '양이 좀 적음' } },
  { id: 'meal-plain', category_id: 'workMeal', occurred_on: '2026-09-30', amount: 17000,
    weather_label: '강한 이슬비', temperature_max: 24.2,
    data: { restaurant: '마당집', menuItems: [{ name: '제육볶음', amount: 17000 }], memo: '다음에도 점심 먹으러 오기' } },
  { id: 'long', category_id: 'workMeal', occurred_on: '2026-10-02', amount: 1234567, rating: 3.5, photoUrl: photo,
    weather_label: '약한 비', temperature_max: 0,
    data: { restaurant: '이름이 아주 긴 테스트 식당 구리인창점', menuItems: [{ name: '김치찌개', amount: 9000 }, { name: '계란말이', amount: 3000 }], memo: '메모가 길어도 카드 높이는 늘어나지 않고 상세 화면에서는 전체 내용을 볼 수 있어야 합니다.' } },
  { id: 'no-poster', category_id: 'video', rating: null,
    data: { title: '이름이 아주 긴 시리즈 영상시청 기록', startDate: '2026-09-01', endDate: '2026-10-02', watchStatus: '진행 중', episodeStart: 1, episodeEnd: 16, detailGenres: ['드라마', '범죄'], memo: '감상평 전체 내용' } },
  { id: 'empty', category_id: 'workMeal', occurred_on: '2026-10-02', amount: null, data: { restaurant: '메뉴 없는 기록' } },
  { id: 'legacy', category_id: 'workMeal', occurred_on: '2026-10-02', amount: 0, rating: 0, data: { restaurant: '이전 식당', menu: '비빔밥' } },
  { id: 'shopping', category_id: 'shopping', occurred_on: '2026-10-02', amount: 35000,
    data: { store: '테스트 매장', productItems: [{ name: '티셔츠', amount: 30000 }, { name: '양말', amount: 5000 }] } },
  { id: 'dining', category_id: 'dining', occurred_on: '2026-10-02', amount: 9000, data: { restaurant: '기존 외식 카드', menuItems: [{ name: '비빔밥', amount: 9000 }] } },
];

export default function RecordCardsFixture() {
  const [viewing, setViewing] = useState(null);
  const [action, setAction] = useState('');
  return (
    <div className="app-shell">
      <main className="screen">
        <h1>기록 카드 테스트</h1>
        <output data-testid="card-action">{action}</output>
        <div className="record-list">
          {samples.map((record) => (
            <div key={record.id} data-record-id={record.id}>
              <RecordCard record={record} onOpen={setViewing} onEdit={() => setAction(`edit:${record.id}`)} onDelete={() => setAction(`delete:${record.id}`)} />
            </div>
          ))}
        </div>
      </main>
      {viewing && <RecordDetailModal record={viewing} onClose={() => setViewing(null)} onEdit={() => setAction('detail-edit')} onDelete={() => setAction('detail-delete')} />}
    </div>
  );
}
