# Goodlife Journal

개인 일상을 기록하는 React + Supabase 웹앱입니다. AI API나 GPT 토큰을 사용하지 않습니다.

## 현재 포함된 기능

- 이메일 로그인/가입
- 사용자별 개인 기록 분리
- 20개 카테고리: 영상시청, 낚시, 외식, 요리, 운동, 쇼핑, 모임, 게임, 꿈 기록, 아이디어, 레시피, 투자, 병원진료, 월급, 배달음식, 적금, 구독관리, 회사식사, 국내여행, 해외여행
- 카테고리 정의 기반 동적 입력폼
- 전 카테고리 0.5점 단위 평점
- 사진 업로드: private Supabase Storage + signed URL
- 통합 검색, 날짜/금액/평점 필터
- 메인 월간 지출, 수입, 순수입
- 설정에서 카테고리별 지출/수입/집계 제외 선택
- 설정에서 카테고리 숨김 및 순서 변경
- TMDB 검색 Edge Function: 작품명, 포스터, TMDB 장르 반영
- 주식 현재가 Edge Function 틀: 추후 실시간 주가 API 연결용
- 향후 공유/비교 기능을 위한 DB 구조

## 이번 로컬 테스트 버전의 주요 입력 개선

- 영상시청: TMDB 장르, 시작/종료 에피소드, 진행 중/시청완료 상태
- 낚시: 마릿수, 선상/갯바위/방파제/워킹/루어/민물/좌대 등 낚시 종류
- 쇼핑: 구매처
- 모임: 모임명
- 꿈 기록: 자고 일어났을 때 기분 선택
- 아이디어: 생각만 함/진행 중/완료/보류 상태
- 투자: 종목코드 또는 주식이름 입력, 계좌형 요약 화면
- 월급: 세전/세후 기준, 보너스 토글 및 보너스 금액
- 구독관리: OTT/서비스/쇼핑 등 분류
- 회사식사: 식당명, 메뉴별 금액
- 해외여행: 항공사, 교통수단, 항공/교통비, 숙소비, 반복 지출내역

## 로컬 실행

```bash
cd goodlife-journal
npm install
copy .env.example .env
npm run dev
```

`.env`에 Supabase 값을 넣습니다.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=ey
```

주의: `VITE_`로 시작하는 값은 브라우저에 노출됩니다. TMDB, 주식 API secret, Supabase service role key는 절대 넣지 마세요.

## Supabase 설정

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.
3. Authentication에서 Email provider를 켭니다.
4. Storage에 `record-photos` 버킷이 private인지 확인합니다.
5. Edge Function secret을 설정합니다.

```bash
supabase secrets set TMDB_API_KEY=새로_발급한_TMDB_KEY
```

기존에 대화나 코드에 노출된 TMDB 키는 폐기하고 새 키를 발급하는 것을 권장합니다.

## Edge Functions 배포

Supabase CLI 로그인 후:

```bash
supabase functions deploy tmdb-search
supabase functions deploy stock-price
```

## Vercel 배포

1. GitHub에 이 폴더를 올립니다.
2. Vercel에서 New Project를 선택합니다.
3. Framework Preset은 Vite로 둡니다.
4. Environment Variables에 아래만 넣습니다.
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy를 누릅니다.

API secret은 Vercel이 아니라 Supabase Edge Function secrets에 넣는 방식을 기본으로 사용합니다.

## 5명 이상 사용 시 보안 기준

- 각 사용자는 RLS로 본인 기록만 읽고 씁니다.
- 첫 가입자는 `owner`, 이후 가입자는 `member`가 됩니다.
- 사진은 private bucket에 저장됩니다.
- 공유 기능은 아직 화면에는 없지만 `record_shares` 테이블과 `visibility` 컬럼이 준비되어 있습니다.
- 나중에 친구 비교 기능을 만들 때도 원본 private 기록이 실수로 공개되지 않도록 공유 테이블을 통해 권한을 부여하는 구조입니다.
