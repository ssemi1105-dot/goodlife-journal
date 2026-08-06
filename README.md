# Goodlife Journal

모바일 사용을 우선으로 만든 React + Vite + Supabase 기반 개인 기록 웹앱입니다. 기록, 설정, 사진은 로그인한 사용자별로 분리됩니다.

## 주요 기능

- 이메일 회원가입과 로그인, 사용자별 기록 및 설정 분리
- 23개 카테고리와 카테고리별 입력 폼
- 지출/수입 집계, 검색과 필터, 카테고리 표시 및 집계 설정
- 0.5점 단위 별점, 사진 압축 업로드와 비공개 Storage
- TMDB 작품 검색, 한국투자 현재가 조회, 쇼핑 영수증 OCR
- 날짜별 날씨 저장, 월급/적금/구독 등록 알림
- 친구 연결, 카테고리 공유 설정, 영상시청 친구 반응 비교
- 관리자 전용 회원 목록

핵심 기록 기능은 AI API나 GPT 토큰 없이 동작합니다. 쇼핑 영수증 OCR만 선택적으로 Anthropic API를 사용하며, API 키는 Supabase Edge Function secret에만 저장합니다.

## 로컬 실행

```powershell
cd C:\Users\ssemi\Documents\Goodlife\goodlife-journal
npm install
Copy-Item .env.example .env
npm run dev
```

`.env`에는 공개 가능한 Supabase 프로젝트 URL과 anon key만 넣습니다.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`VITE_`로 시작하는 값은 브라우저에 노출됩니다. `SUPABASE_SERVICE_ROLE_KEY`, TMDB 키, KIS APP SECRET, Anthropic 키는 절대 `.env`나 프론트 코드에 넣지 마세요.

## Supabase 설정

새 프로젝트는 SQL Editor에서 `supabase/schema.sql`을 실행합니다. 기존 프로젝트는 `supabase/migrations`의 미적용 파일만 날짜순으로 적용합니다.

현재 Edge Functions:

- `tmdb-search`: 영상 작품 검색
- `kis-proxy`: 한국투자 종목 검색 및 현재가 조회
- `receipt-ocr`: 쇼핑 영수증 OCR
- `admin-list-users`: 관리자 회원 목록
- `friend-actions`: 친구 요청과 수락/거절
- `shared-video-reactions`: 친구의 영상시청 반응 조회

필요한 사용자 설정 secret:

```powershell
supabase secrets set TMDB_API_KEY=your-key
supabase secrets set KIS_APP_KEY=your-key KIS_APP_SECRET=your-secret KIS_BASE_URL=https://openapi.koreainvestment.com:9443
supabase secrets set ANTHROPIC_API_KEY=your-key
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase Edge Function 환경에서 제공되는 서버 전용 값입니다. Functions는 JWT 검증을 끄지 않은 기본 설정으로 배포합니다.

```powershell
supabase functions deploy tmdb-search
supabase functions deploy kis-proxy
supabase functions deploy receipt-ocr
supabase functions deploy admin-list-users
supabase functions deploy friend-actions
supabase functions deploy shared-video-reactions
```

## 배포 전 확인

```powershell
npm run build
git status
```

Vercel에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만 설정합니다. 서버 비밀키는 Supabase에만 둡니다.

업그레이드 전 백업, 마이그레이션, 배포 확인 순서는 [업그레이드 체크리스트](docs/UPGRADE_CHECKLIST.md)를 따릅니다.

## 보안 기준

- `records`, 설정, 사진은 사용자 ID와 RLS로 분리합니다.
- 사진은 private bucket에 저장하고 만료되는 signed URL로 표시합니다.
- 프로필 `role`은 브라우저에서 변경할 수 없고 service-role 서버 코드에서만 관리합니다.
- 관리자 회원 목록과 개인 기록 접근 권한은 별개입니다.
- `.env`, service role key, 외부 API secret은 Git에 커밋하지 않습니다.
