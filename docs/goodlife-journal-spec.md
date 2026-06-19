# Goodlife Journal 앱 기능/구현 명세서

작성 기준 버전: `0.1.8`

이 문서는 Goodlife Journal 앱을 외부 웹 채팅이나 개발 상담에서 설명하기 위한 명세서입니다. 실제 API 키, Supabase service role key, TMDB key, 한국투자 API secret 등 민감 정보는 포함하지 않습니다.

## 1. 앱 개요

Goodlife Journal은 개인 일상, 소비, 취미, 건강, 여행, 투자, 월급/구독/적금 등을 모바일에서 빠르게 기록하는 React/Vite/Supabase 기반 웹앱입니다.

핵심 목표는 다음과 같습니다.

- 스마트폰, 특히 Android Chrome에서 빠르게 기록한다.
- 카테고리별로 필요한 상세 필드를 다르게 제공한다.
- 지출/수입/기록 건수를 홈에서 간단히 확인한다.
- 사진, 날씨, 영수증 OCR, TMDB, 주식 현재가 등 외부 데이터를 기록에 보조 정보로 붙인다.
- 사용자별 데이터가 절대 섞이지 않도록 Supabase Auth와 `user_id` 기준으로 분리한다.
- 프론트엔드에 민감 API secret을 저장하지 않는다.
- 추후 친구 공유, 비교, 통계, 추천, 자동화 기능으로 확장할 수 있는 구조를 유지한다.

## 2. 기술 스택

- Frontend: React 18, Vite
- Backend/Auth/DB/Storage: Supabase
- Routing: 별도 라우터 없이 `App.jsx` 내부 view state로 `home`, `category`, `settings` 전환
- Styling: 전역 `src/styles.css`
- Build: `npm.cmd run build`
- 배포: Vercel 기준으로 운영 중

주요 파일 구조:

```text
src/
  App.jsx
  components/
    Dashboard.jsx
    CategoryView.jsx
    RecordModal.jsx
    RecordCard.jsx
    RecordDetailModal.jsx
    SettingsScreen.jsx
    ShareSettingsPanel.jsx
    AdminUserList.jsx
    ui/
      ChipGroup.jsx
      CompactToggle.jsx
      DateRangeField.jsx
      LineItemsInput.jsx
      PhotoUploader.jsx
      StarRating.jsx
      InvestmentMoodImage.jsx
      RecordImagePreview.jsx
  data/
    categoryDefinitions.js
  hooks/
    useAuth.js
    useRecords.js
    useAppSettings.js
    useSharing.js
  services/
    weatherClient.js
    kisApiClient.js
    receiptOcrClient.js
  utils/
    recordUtils.js
  lib/
    supabaseClient.js
    appVersion.js
supabase/
  functions/
  migrations/
  schema.sql
```

## 3. 현재 주요 기능

### 3.1 인증 및 사용자별 데이터 분리

- Supabase Auth 기반 로그인/회원가입.
- 기록 조회/저장/수정/삭제는 `records.user_id = auth.user.id` 기준.
- 설정도 `app_settings.user_id` 기준으로 사용자별 저장.
- 관리자 계정은 회원관리 섹션을 볼 수 있지만, 일반 사용자 기록을 자동으로 모두 보는 구조는 아님.

### 3.2 홈 화면

홈 화면에는 다음 정보가 표시됩니다.

- 앱명과 버전 표시: `GOODLIFE JOURNAL VERSION 0.1.8`
- 이번 달 기록 건수
- 지출/수입 요약
- 통계 버튼 자리
- 카테고리 카드 목록
- 하단 고정 내비게이션: 홈 / 중앙 FAB `+` / 설정

홈의 지출/수입 요약은 기간 순환 구조를 가진 적이 있으며, 현재 기록/카테고리/설정 흐름과 연결되어 있습니다.

### 3.3 카테고리 기록

현재 카테고리 목록:

```text
영상시청, 낚시, 외식, 요리, 운동, 쇼핑, 모임, 게임, 꿈 기록,
아이디어, 레시피, 투자, 병원진료, 월급, 배달음식, 적금,
구독관리, K-pass, 연차관리, 회사식사, 나들이, 국내여행, 해외여행
```

카테고리는 `src/data/categoryDefinitions.js`에서 정의합니다.

각 카테고리는 다음 속성을 가집니다.

```js
{
  id,
  label,
  color,
  titleField,
  amountField,
  incomeField,
  fields: [...]
}
```

필드 타입 예시:

```text
text, number, money, date, time, duration, textarea,
choice, multiChoice, moodChoice, boolean,
rating, tags, lineItems, dateRange, photos, tmdb
```

### 3.4 주요 카테고리 기능

#### 영상시청

- TMDB 검색 기반 작품 선택
- 수동 작품명 입력 fallback
- 대분류: 영화/드라마/예능/다큐/애니/유튜브/기타
- 세부 장르 복수 선택
- 시청 기간 시작일/종료일
- 에피소드 시작/종료
- 시청 상태
- 별점 0.5 단위
- TMDB 포스터 썸네일/상세 표시
- 친구 반응 비교 기능을 위한 구조 존재

#### 외식/배달/회사식사

- 메뉴별 금액 입력
- 외식은 단가/수량 기반 계산
- 배달은 메뉴별 가격 + 배달료 + 총 결제금액
- 회사식사는 식사 위치와 결제방식 선택
- Android 한글 입력 포커스 문제를 피하기 위해 line item 입력은 uncontrolled input + stable clientId 구조 사용

#### 쇼핑

- 구매처
- 상품별 가격
- 단가/수량/할인/총액 계산
- 상품 리스트는 카드에서 세로 표시, 최대 10개 후 `...`
- 영수증 사진/OCR 자동 인식 Edge Function 연결 구조

#### 투자

- 종목코드/종목명
- 평균매수가, 보유수량, 현재가
- 총 매입가, 총 평가금액, 수익금, 수익률 자동 계산
- 한국투자증권 KIS API는 Supabase Edge Function 프록시를 통해 현재가 조회
- KIS secret은 프론트엔드에 두지 않음
- 수익률 구간별 감정 이미지 표시

#### 병원진료

- 병원비, 보험 환급금, 실제 부담금 계산
- 전체 지출 집계는 실제 부담금 중심으로 처리 가능

#### 연차관리

- 부여 기록과 사용 기록을 구분
- 0.5일 단위 입력 가능
- 현재 연도 기준 부여/사용/잔여 연차 계산
- 카테고리 상세 상단에 연차 요약 패널

#### K-pass

- 연월, 충전금액, 환급금액
- 순비용과 환급률 자동 계산

#### 나들이/국내여행/해외여행

- 나들이: 당일치기 장소, 동행, 이동수단, 금액, 사진
- 국내여행/해외여행: 기간, 장소, 숙소, 교통, 비용 등
- 해외여행은 항공권/숙소/현지 지출 구조

### 3.5 사진 업로드

- `PhotoUploader`에서 클라이언트 압축/프리뷰 처리
- Supabase Storage에 저장
- 기록 목록에는 첫 사진 썸네일 표시
- 상세 모달에는 사진 목록 표시
- 저장 구조 예:

```js
data.photos = [
  {
    path,
    width,
    height,
    size,
    type
  }
]
```

### 3.6 날씨 자동 저장

Open-Meteo API를 사용합니다.

- 기본 위치: 경기도 구리시 인창동
- 위치명 검색으로 위도/경도 자동 선택 가능
- 저장 컬럼:

```text
records.weather_code
records.weather_label
records.temperature_max
records.temperature_min
records.weather_location
records.weather_latitude
records.weather_longitude
records.weather_fetched_at
```

동작 방식:

- 영상시청과 K-pass를 제외한 날짜성 기록에 날씨를 붙일 수 있음
- 새 기록 저장 시 날씨가 비어 있으면 최대 약 1.8초만 기다림
- 실패하거나 늦으면 기록 저장은 계속 진행
- 설정 > 데이터/연동 > 누락된 날씨 채우기에서 기존 기록의 빈 날씨를 한 번에 채울 수 있음
- 이미 날씨가 있는 기록은 다시 조회하지 않음

### 3.7 월급/적금/구독료 등록 알림

설정 > 데이터/연동에서 다음 알림을 켤 수 있습니다.

- 월급 등록 알림
- 적금 등록 알림
- 구독료 등록 알림

동작 방식:

- 사용자가 날짜를 지정하고 ON 설정
- 앱 실행일이 지정일과 같으면 홈 화면에 안내 배너 표시
- 오늘 이미 해당 카테고리 기록이 있으면 표시하지 않음
- 오늘은 안 보기를 누르면 그날 다시 표시하지 않음
- 등록 버튼을 누르면 해당 카테고리 입력 모달을 기본값과 함께 바로 오픈

설정 저장 위치:

```js
app_settings.finance_modes.__reminder_settings
```

현재는 별도 DB 컬럼 추가 없이 기존 `app_settings.finance_modes` JSON 내부의 private key에 저장합니다.

### 3.8 설정 화면 아코디언

설정 화면의 큰 섹션은 접기/펼치기 구조입니다.

- 내 프로필
- 친구/공유
- 카테고리 설정
- 데이터/연동
- 회원관리

접힘 상태는 `localStorage`에 사용자별 키로 저장합니다.

```text
goodlife-settings-sections-{userId}
```

DB에는 저장하지 않습니다. 이유는 접힘/펼침이 앱 데이터라기보다 기기별 UI 상태에 가깝기 때문입니다.

## 4. 데이터 저장 구조

### 4.1 records 테이블

핵심 저장 방식:

- 공통 검색/집계를 위해 자주 쓰는 값은 컬럼으로 저장
- 카테고리별 상세 필드는 `data` JSONB에 저장

대표 컬럼:

```text
id
user_id
category_id
title
occurred_on
amount
income_amount
rating
data
created_at
updated_at
weather_code
weather_label
temperature_max
temperature_min
weather_location
weather_latitude
weather_longitude
weather_fetched_at
```

저장 흐름:

1. `RecordModal`에서 입력
2. `saveRecord(categoryId, formData, existingRecord)` 호출
3. `deriveRecordColumns()`로 공통 컬럼 계산
4. `cleanDataForSave()`로 `_clientId`, 임시 file, preview URL 제거
5. Supabase `records` insert/update

### 4.2 app_settings 테이블

사용자별 설정 저장:

```text
user_id
category_order
hidden_categories
finance_modes
updated_at
```

현재 `finance_modes` JSON 내부에 다음 private setting도 함께 저장합니다.

```js
{
  dining: 'expense',
  salary: 'income',
  ...
  __sort_by_record_count: true,
  __reminder_settings: {
    salary: { enabled: true, day: '25' },
    savings: { enabled: false, day: '' },
    subscription: { enabled: true, day: '10' },
    dismissed: {
      'salary-2026-06-25': true
    }
  }
}
```

추후 개선 시 `ui_settings`, `reminder_settings` 같은 별도 JSONB 컬럼을 두는 것이 더 깔끔합니다.

### 4.3 sharing 관련 테이블

친구/공유 기능을 위해 다음 구조를 사용하거나 준비합니다.

```text
profiles
user_share_settings
friendships
```

공유 원칙:

- 모든 기록은 기본 비공개
- 카테고리별 공유 ON/OFF
- 친구 관계가 있고 양쪽 설정이 맞는 경우에만 비교 가능
- 영상시청은 같은 `tmdbId` 기준으로 친구 반응 비교 가능

## 5. 핵심 코딩 방식

### 5.1 카테고리 정의 기반 폼 렌더링

`categoryDefinitions.js`에 카테고리와 필드를 선언하고, `RecordModal`과 `FieldInput`이 이를 읽어 입력 폼을 렌더링합니다.

장점:

- 새 카테고리 추가가 비교적 쉬움
- 필드 타입별 공통 UI 재사용 가능
- 카테고리별 화면을 매번 새로 만들 필요가 적음

단점:

- 특수 로직이 많아질수록 `RecordModal`, `recordUtils`가 커질 수 있음
- 장기적으로는 카테고리별 adapter/serializer 분리가 필요할 수 있음

### 5.2 Android 한글 입력 안정성

`LineItemsInput`은 Android Chrome에서 한글 IME 입력 중 키보드가 내려가거나 커서가 사라지는 문제를 피하기 위해 다음 방식을 사용합니다.

- 입력값을 React controlled value로 매번 렌더링하지 않음
- `defaultValue` 기반 uncontrolled input 사용
- 각 행은 `_clientId` stable key 사용
- 사용자가 입력 중인 값은 `itemsRef.current`와 `formRef.current`에 draft로 저장
- 저장 직전에 정리/숫자 변환

주의:

- 입력값을 key로 쓰지 않음
- 한글 입력 중 trim/normalize/format을 하지 않음
- 숫자 변환은 저장 직전 또는 계산 시점에만 수행

### 5.3 금액 계산

`recordUtils.js`의 `toNumber`, `calcLineItemAmount`, `deriveRecordColumns`가 핵심입니다.

Line item 계산:

```js
amount = unitPrice * quantity - discountAmount
```

fallback:

```js
amount = item.amount ?? item.price
```

카테고리별 대표 금액:

- 외식/쇼핑/회사식사: lineItems 합산
- 배달: menuItems + deliveryFee
- 병원: netMedicalCost
- K-pass: netCost
- 월급: netAmount, 보너스 포함 가능
- 투자: avgBuyPrice * quantity 기준

### 5.4 외부 API 보안

프론트에 secret을 두지 않는 것이 원칙입니다.

현재 구조:

- TMDB 검색: Supabase Edge Function 사용
- 한국투자 API: Supabase Edge Function `kis-proxy` 사용
- Receipt OCR: Supabase Edge Function 사용
- Open-Meteo 날씨: API key가 필요 없는 공개 API라 클라이언트 직접 호출

금지:

- KIS_APP_SECRET을 React 코드에 넣기
- Supabase service role key를 프론트에 넣기
- localStorage에 API secret 저장하기
- GitHub에 `.env` 커밋하기

## 6. 현재 UX 특징

- 모바일 우선
- 하단 fixed nav + 중앙 FAB
- 설정 화면은 아코디언 형태
- 카테고리별 기록은 카드 리스트
- 기록 상세는 모달
- 검색은 모달
- 별점은 5개 별 터치 방식, 0.5 단위 지원
- 버튼/토글/chip은 공통 UI 컴포넌트 재사용

## 7. 현재 알고 있는 개선 포인트

외부 웹 채팅에서 개선 의견을 물어볼 때 좋은 질문들입니다.

### 7.1 데이터 구조 개선

- `app_settings.finance_modes` 안에 내부 설정을 넣는 방식이 임시 구조인데, 별도 JSONB 컬럼이나 테이블로 분리하는 것이 좋은가?
- 카테고리별 JSONB `data` 구조가 커지고 있는데, 장기적으로 일부 카테고리는 별도 테이블로 분리하는 것이 좋은가?
- 반복 결제/월급/적금은 현재 일반 기록인데, recurring transaction 모델을 따로 둬야 하는가?

### 7.2 모바일 UX 개선

- 기록 추가 모달이 카테고리별로 길어질 때 어떤 단계형 UI가 좋을까?
- 설정 화면의 아코디언 기본 펼침 정책은 어떻게 잡는 것이 좋을까?
- 외식/쇼핑의 line item 입력을 더 빠르게 만드는 UX는 무엇이 있을까?

### 7.3 통계/대시보드

- 지출/수입 요약을 주간/월간/분기/연간으로 보는 가장 직관적인 UI는?
- 카테고리별 소비 추이, 월별 비교, 평균 비교를 어떻게 보여줄까?
- 투자 카테고리와 일상 지출 통계를 분리해서 보여주는 것이 좋을까?

### 7.4 공유/친구 비교

- 영상시청의 친구 반응 비교를 어떻게 보여주면 프라이버시와 재미를 모두 잡을 수 있을까?
- 친구 공유는 카테고리 단위가 좋은가, 기록별 공개가 좋은가?
- 병원/투자/월급 같은 민감 카테고리는 어떤 기본 정책이 안전한가?

### 7.5 자동화

- 날씨 백필을 수동 버튼이 아니라 저장 후 백그라운드 큐처럼 처리할 수 있을까?
- 월급/적금/구독료 알림은 앱 실행 시 배너로 충분한가, PWA push notification까지 가야 하는가?
- 영수증 OCR 이후 사용자가 수정하기 쉬운 검수 UI는 어떻게 만들까?

## 8. 외부 웹 채팅용 질문 프롬프트

아래 문장을 웹 채팅에 그대로 붙여 넣으면 됩니다.

```text
나는 React/Vite/Supabase 기반의 개인 라이프로그 웹앱 Goodlife Journal을 만들고 있다.
모바일, 특히 Android Chrome에서 빠르게 기록하는 것이 핵심이다.

현재 기능:
- Supabase Auth 사용자별 기록 분리
- 카테고리 기반 기록: 영상시청, 외식, 배달, 쇼핑, 투자, 병원, 연차관리, K-pass, 월급, 적금, 구독관리, 여행 등
- 카테고리 정의 파일에서 fields를 선언하고 RecordModal이 동적으로 폼을 렌더링
- records 테이블은 공통 컬럼(title, occurred_on, amount, income_amount, rating 등) + data JSONB 구조
- 사진 업로드, 날씨 자동 저장, 영수증 OCR, TMDB 검색, 한국투자 API 현재가 조회 준비
- Android 한글 입력 문제를 피하려고 line item 입력은 uncontrolled input + stable clientId + formRef draft 방식
- 설정 화면은 아코디언 구조
- 월급/적금/구독료 날짜 알림 배너
- 날씨 누락 기록 백필 기능
- 친구/공유 및 영상시청 친구 반응 비교 구조

보안 원칙:
- Supabase service role key, KIS secret, TMDB key 등은 프론트에 노출하지 않음
- 민감 API는 Supabase Edge Function에서 처리
- 사용자 기록은 user_id 기준으로 분리

내가 고민하는 점:
1. 카테고리별 JSONB data 구조를 계속 유지해도 괜찮을지, 일부를 별도 테이블로 나눠야 할지
2. 월급/적금/구독료처럼 반복성 있는 기록을 일반 기록으로 둘지, recurring transaction 모델을 따로 둬야 할지
3. 모바일 기록 추가 UX를 더 빠르고 세련되게 만드는 방법
4. 친구 공유/비교 기능을 개인정보 침해 없이 설계하는 방법
5. 통계 화면과 투자 화면을 어떻게 분리하거나 통합하면 좋을지
6. 설정 화면, 카테고리 관리, 날씨/OCR/외부 API 연동 구조를 더 깔끔하게 개선하는 방법

이 앱을 장기적으로 안정적으로 키우기 위한 UX, 데이터 구조, 보안, 컴포넌트 구조 개선안을 제안해줘.
```

## 9. 개발 시 주의사항

- 기존 사용자 기록을 깨뜨리지 않는다.
- `records.data`의 기존 필드는 backward compatibility를 유지한다.
- Android 한글 입력 중 값 정규화/trim/format을 즉시 하지 않는다.
- line item key로 입력값을 쓰지 않는다.
- 저장 직전에만 숫자 변환/정리한다.
- secret은 Edge Function 또는 서버 환경에만 둔다.
- 새 Supabase 컬럼이 필요하면 migration SQL과 RLS 정책을 함께 설계한다.
- 빌드 확인은 `npm.cmd run build`.

