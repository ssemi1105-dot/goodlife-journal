import { useState } from 'react';
import { CATEGORIES } from '../src/data/categoryDefinitions';
import CategoryView from '../src/components/CategoryView';
import RecordCard from '../src/components/RecordCard';
import RecordDetailModal from '../src/components/RecordDetailModal';
import { KpassMonthModal } from '../src/components/KpassRecords';
import { todayIso } from '../src/utils/recordUtils';

const date = todayIso();
const year = date.slice(0, 4);
const samples = {
  video: { title: '트로이', tmdbPosterUrl: '/tests/missing-poster.jpg', mediaType: '영화', watchStatus: '시청완료', detailGenres: ['역사', '전쟁'], memo: '감독판 감상' },
  dining: { restaurant: '골목식당 인창점', menuItems: [{ name: '김치찌개', amount: 18000, quantity: 2 }, { name: '계란말이', amount: 8000 }], payRelation: '더치페이', peopleCount: 2, withWhom: '친구', diningType: '한식', paymentMethod: '카드', memo: '식당과 메뉴를 같은 줄에서 확인' },
  workMeal: { restaurant: '회사 앞 식당', menuItems: [{ name: '제육볶음', amount: 10000 }], companyMealPaymentType: '법인카드', memo: '점심 식사' },
  delivery: { restaurant: '맛있는 치킨', menuItems: [{ name: '반반치킨', amount: 22000 }], deliveryPlatform: '배민', payRelation: '내가쏨', deliveryFee: 3000, totalAmount: 25000 },
  shopping: { store: '테스트 구매처', productItems: Array.from({ length: 12 }, (_, i) => ({ name: `상품 ${i + 1} 긴 이름도 전체 가로폭 활용`, amount: (i + 1) * 1000 })), purpose: '생활용품' },
  fishing: { location: '통영 선착장', targetFish: ['우럭', '광어'], fishingType: ['선상'], catchCount: 8, weight: 2.5, amount: 90000 },
  cooking: { dish: '김치볶음밥', duration: '30분', difficulty: '쉬움', ingredients: ['김치', '밥', '계란'], amount: 5000 },
  recipe: { dish: '크림 파스타', ingredients: ['우유', '양파', '파스타'], steps: '양파를 볶는다.\n우유와 파스타를 넣는다.\n긴 조리법도 상세에서 전체 표시한다.' },
  meeting: { meetingName: '오랜 친구들 모임', place: '구리', attendees: ['친구 A', '친구 B'], amount: 30000 },
  game: { game: '테스트 게임', platform: 'PC', duration: '1시간 30분' },
  dream: { content: '기억에 남는 꿈\n상세 내용은 줄바꿈을 유지해서 읽습니다.', wakeMood: '상쾌함', emotion: '긍정' },
  idea: { title: '새로운 아이디어', ideaCategory: '생활', ideaStatus: '진행중', ideaOrigin: '갑자기 생각남', content: '불편한 일을 쉽게 바꾸는 방법에 대한 자세한 내용' },
  investment: { assetName: '테스트 주식', symbol: '000660', recordType: 'watch', market: 'KR', currentPrice: 180000, priceChangeRate: -2.25, priceChange: -4000, targetPrice: 170000 },
  hospital: { hospitalName: '튼튼한 의원', department: '내과', symptom: '정기검진', medicalCost: 50000, insuranceRefund: 50000, netMedicalCost: 0, medicines: ['약 A', '약 B'] },
  salary: { company: '테스트 회사', salaryBasis: '세전', grossAmount: 3500000, tax: 400000, netAmount: 3100000, bonus: false },
  savings: { name: '미래 적금', monthlyAmount: 500000, interestRate: 3.5, maturityDate: `${Number(year) + 1}-12-31` },
  subscription: { service: '테스트 OTT', monthlyCost: 17000, subscriptionType: 'OTT', billingDay: 15, active: false },
  kpass: { yearMonth: date.slice(0, 7), chargeAmount: 50000, refundAmount: 15000 },
  annual_leave: { recordType: 'grant', year, grantDays: 10.5 },
  exercise: { bodyWeight: 65.5, armCm: 30.5, waistCm: 76, thighCm: 52, calfCm: 34, memo: '아침 측정' },
  outing: { destination: '서울숲', companions: ['가족'], transport: '자동차', amount: 40000 },
  domesticTravel: { region: '강릉', startDate: `${year}-05-01`, endDate: `${year}-05-03`, places: ['해변', '시장'], companions: ['가족'], transport: '기차', lodging: '호텔', amount: 300000 },
  overseasTravel: { country: '일본', cities: ['오사카'], startDate: `${year}-05-01`, endDate: `${year}-05-04`, airline: '항공사', airfare: 300000, lodging: '호텔', lodgingCost: 250000, currency: 'JPY', krwAmount: 700000, localExpenses: [{ name: '라멘', amount: 1200, rating: 4.5 }, { name: '교통카드', amount: 2000 }] },
  vehicle: { vehicleName: '테스트 차량', maintenanceType: '정비', location: '정비소', odometerKm: 35400, serviceItems: [{ name: '엔진오일', amount: 70000 }], nextServiceDate: `${Number(year) + 1}-01-15` },
  culture: { eventTitle: '주말 전시회', cultureType: '전시', venue: '시립미술관', companions: ['가족'], amount: 20000 },
};
const seedRecords = CATEGORIES.map((category) => ({ id: category.id, category_id: category.id, occurred_on: date, amount: category.id === 'hospital' ? 50000 : 26000, income_amount: category.id === 'salary' ? 3100000 : 0,
  rating: category.id === 'annual_leave' ? null : 4.5, weather_label: '맑음', temperature_max: 24,
  data: { date, ...samples[category.id] } }));
seedRecords.push(...Array.from({ length: 13 }, (_, i) => ({ id: `leave-${i}`, category_id: 'annual_leave', occurred_on: `${year}-09-${String(i + 1).padStart(2, '0')}`, data: { recordType: 'use', date: `${year}-09-${String(i + 1).padStart(2, '0')}`, days: i % 2 ? 0.5 : 1, reason: '개인 사유' } })));

export default function PresentationFixture() {
  const [category, setCategory] = useState('all');
  const [viewing, setViewing] = useState(null);
  const [month, setMonth] = useState(null);
  const [records, setRecords] = useState(seedRecords);
  const [action, setAction] = useState('');
  window.presentationFixture = { records, setRecords, setCategory };
  const onOpen = (record) => { setMonth(null); setViewing(record); };
  return <div className="app-shell">
    <label className="test-category-select">테스트 카테고리 <select aria-label="테스트 카테고리" value={category} onChange={e => setCategory(e.target.value)}><option value="all">전체</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <output data-testid="presentation-action">{action}</output>
    {category === 'all' ? <main className="screen"><section className="record-list">{records.map(record => <div data-record-id={record.id} key={record.id}><RecordCard record={record} onOpen={onOpen} onEdit={r => setAction(`edit:${r.id}`)} onDelete={r => setAction(`delete:${r.id}`)} /></div>)}</section></main>
      : <CategoryView key={category} categoryId={category} records={records} onBack={() => setCategory('all')} onAdd={() => {}} onOpenRecord={onOpen} onEdit={r => setAction(`edit:${r.id}`)} onDelete={r => setAction(`delete:${r.id}`)} onOpenKpassMonth={setMonth} quotesPaused />}
    {viewing && <RecordDetailModal record={viewing} onClose={() => setViewing(null)} onEdit={r => setAction(`edit:${r.id}`)} onDelete={r => setAction(`delete:${r.id}`)} />}
    {month && <KpassMonthModal records={records} month={month} onClose={() => setMonth(null)} onOpenRecord={onOpen} />}
  </div>;
}
