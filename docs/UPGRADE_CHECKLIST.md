# Goodlife Journal 업그레이드 체크리스트

## 1. 작업 전

1. `git status`가 깨끗한지 확인합니다.
2. 현재 버전의 ZIP 백업과 Git 태그를 만듭니다.
3. Supabase Dashboard에서 데이터베이스 백업 상태를 확인합니다.
4. `.env`와 API secret이 Git 추적 대상이 아닌지 확인합니다.

현재 기준 복구 지점:

- ZIP: `C:\Users\ssemi\Documents\Goodlife\backups\goodlife-journal-pre-upgrade-v0.1.9-20260806.zip`
- Git tag: `backup-pre-upgrade-v0.1.9-20260806`

태그를 원격에도 보관하려면:

```powershell
git push origin backup-pre-upgrade-v0.1.9-20260806
```

## 2. 개발 중

1. 기존 `records.data` 필드는 삭제하거나 이름을 바꾸지 않습니다.
2. 새 필드는 이전 기록에 값이 없어도 렌더링되도록 기본값을 둡니다.
3. 모든 조회, 수정, 삭제에 현재 `user_id` 조건이 있는지 확인합니다.
4. API secret은 Edge Function에서만 읽습니다.
5. 데이터베이스 변경은 새 migration SQL 파일로 추가합니다.

## 3. 배포 전

```powershell
npm run build
git diff --check
git status
```

모바일에서 로그인, 기록 추가/수정/삭제, 한글 입력, 사진, 하단 내비게이션을 확인합니다.

## 4. Supabase 변경

기존 프로젝트에서는 `supabase/migrations`의 새 SQL을 날짜순으로 적용합니다. Supabase CLI를 사용한다면 연결된 프로젝트를 재확인한 뒤 실행합니다.

```powershell
supabase db push
```

Edge Function을 수정한 경우 해당 함수만 다시 배포합니다. `--no-verify-jwt` 옵션은 사용하지 않습니다.

## 5. GitHub와 Vercel

```powershell
git add .
git commit -m "업그레이드 내용"
git push
```

Vercel 배포 후 홈 화면 버전, 로그인, 기록 저장을 확인합니다.

## 6. 복구 방법

기존 작업을 지우는 명령 대신 백업 태그에서 별도 복구 브랜치를 만듭니다.

```powershell
git switch -c restore-v0.1.9 backup-pre-upgrade-v0.1.9-20260806
```

이 방식은 현재 작업과 복구본을 모두 보존합니다.

## 7. v0.2.2 보완 적용

코드 변경 전 기준 커밋은 `8e214ae` (v0.2.1)입니다. 이번 변경은 기존 기록을 일괄 수정하지 않습니다.

- 금액: 금액 직접 입력과 단가/수량 입력을 구분합니다. 기존 숨은 단가가 새 금액을 덮지 않습니다.
- 월급: 세전 모드는 세전 금액과 세금을 바꿀 때마다 세후 금액을 계산합니다. 세후 모드는 직접 입력을 유지합니다.
- 날짜: 기간 집계와 기본 날짜는 브라우저의 현지 날짜를 사용합니다.
- 저장: 사진 업로드 후 DB를 저장합니다. 새 기록 재시도는 같은 UUID와 사진 경로를 재사용합니다. 수정은 `updated_at`으로 충돌을 감지합니다.
- 삭제: DB 삭제 성공 후 사진을 정리합니다. Storage와 DB는 별도 서비스라 완전한 트랜잭션은 아닙니다. 통신 결과가 불확실한 저장은 사진을 보존하며, 정리에 실패한 미사용 사진이 남을 수 있습니다.
- 조회: 계정별 500개씩 모든 기록을 확인하며, 중간 오류/건수 불일치가 있으면 부분 다운로드하지 않습니다.
- 백업: JSON v2는 기록·개인 설정을 포함합니다. 선택 시 Storage 사진을 base64로 포함하며 원본 합계 50MB까지 허용합니다. 사진 다운로드 실패 시 부분 백업은 내보내지 않습니다. 자동 복원 UI와 친구 관계 복원은 포함하지 않습니다.
- CSV/인쇄: 현재 카테고리 집계 설정을 적용합니다. CSV에는 원본 금액도 별도 보존합니다.
- 투자: 영향받는 종목의 전체 거래 순서를 검사하며, 매수보다 앞선 매도와 이후 매도를 불가능하게 하는 매수 수정/삭제를 막습니다. 복수 기기의 동시 신규 거래까지 원자적으로 보장하는 DB 거래 원장 전환은 별도 과제입니다.
- 날씨: 결측 코드를 맑음(0)으로 처리하지 않습니다. 기본 인창동 좌표를 37.60, 127.13으로 보정했습니다. 기존에 저장된 날씨를 임의로 다시 쓰지는 않습니다.
- 홈: 빠른 기록은 입력창을 바로 열며, 최근 기록이 전체 카테고리보다 먼저 나옵니다. 통계 버튼은 현재 기간의 지출/수입 상세를 엽니다.
- 입력: 선택 메모/사진을 접을 수 있으며 입력 요소는 유지됩니다. 폼은 한 영역에서 스크롤하고 저장 버튼은 유지됩니다.
- 영수증 OCR과 KIS 프록시는 기존 기능을 유지하며 해당 Edge Function 파일은 수정하지 않았습니다.

### Supabase 적용 순서 (로컬 코드 수정만으로 서버 권한은 바뀌지 않음)

1. Supabase 프로젝트와 데이터 백업을 확인합니다.
2. SQL Editor에서 `supabase/migrations/202610010001_harden_sharing_permissions.sql` 전체를 실행합니다. 기존 기록/사진/친구 관계는 삭제하지 않습니다. 개인 기록 원본은 본인만 읽고, 비교는 서버가 승인한 최소 필드만 제공합니다. 이전 public/record_shares 직접 조회는 의도적으로 차단합니다.
3. 아래 두 함수만 재배포합니다. 로그인 JWT를 검증하고 기존 Supabase 서버 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 사용합니다. 키를 프론트 `.env`에 넣지 않습니다.

```powershell
supabase functions deploy friend-actions --project-ref YOUR_PROJECT_REF
supabase functions deploy shared-video-reactions --project-ref YOUR_PROJECT_REF
```

4. 관리자·일반 사용자 A/B로 확인: A는 B의 records 직접 SELECT 결과가 없어야 합니다. 클라이언트에서 friendships INSERT/UPDATE는 거부되어야 합니다. B만 A의 pending 요청을 수락할 수 있어야 합니다. 양쪽 영상 공유/비교가 ON이고 같은 TMDB 유형(movie/tv)+ID일 때만 반응을 조회합니다.
5. 통계와 새 저장을 확인한 뒤 GitHub/Vercel에 배포합니다.

이번 로컬 검증에는 운영 DB 정책 실행 및 Edge Function 배포가 포함되지 않습니다. 기존 accepted 관계는 유지하므로 의심스러운 연결이 있다면 별도 확인해야 합니다.

### 재현 가능한 검증

```powershell
npm test
npm run build
git diff --check
```

`tests/regressions.test.mjs`는 실제 계산/저장 코드를 사용하며 모의 DB/Storage로 실패 상황을 검증합니다. SQL 검사는 파일 내용 검사이며 실서버 RLS 검증을 대신하지 않습니다.

브라우저 검증은 Playwright와 Edge가 있는 환경에서 `node tests/browser-smoke.mjs`로 실행합니다. 필요하면 `PLAYWRIGHT_PACKAGE` 환경변수에 설치된 Playwright 모듈 경로를 지정합니다. 테스트가 Vite 서버를 켰다가 종료하고 결과를 Git 제외 경로 `test-results/`에 저장합니다. 외부 API 요청을 모두 가로채므로 운영 데이터는 사용/수정하지 않습니다. Android 실기기의 키보드 검증은 별도로 필요합니다.

날씨 API의 최근 과거 날짜 조회는 Open-Meteo 공식 문서(https://open-meteo.com/en/docs)의 날짜 범위를 사용합니다. 7일 이전은 Archive API를 사용합니다.

## 로컬 작업 폴더 정리 (2026-10-19)

앱 동작과 운영 데이터는 변경하지 않고, 다시 생성할 수 있는 로컬 산출물만 정리했습니다.

- `dist/`: 빌드 검증 후 삭제. `npm run build`로 다시 생성됩니다. Vercel 배포는 자체 빌드합니다.
- `test-results/*.png`: 자동 검증용 화면 이미지 삭제. 해당 브라우저 테스트를 실행하면 다시 생성됩니다.
- `node_modules/.vite/deps_temp_*`: 종료된 테스트가 남긴 임시 의존성 캐시 삭제. 검증 후 개발 서버를 다시 실행해 필요한 `deps/` 캐시만 재생성했습니다.
- 사용 중이지 않은 로그 파일 삭제. 실행 중인 미리보기의 로그는 보존했습니다.
- 상위 폴더의 `.tutor-test-runtime/node_modules/`: 고급 튜터 DB/브라우저 검증용 PGlite 설치본만 삭제. 앱 실행과 `npm test`, `npm run build`에는 필요하지 않습니다.

앱의 `node_modules`, 소스, 테스트 코드, SQL, `.env`, `.git`, 이미지, 기존 ZIP 백업, 이전 앱 및 지도 원본은 보존했습니다. 캐시와 테스트 산출물은 이미 `.gitignore` 대상이므로 정리만으로 운영 사이트나 Supabase 용량이 줄어드는 것은 아닙니다.

### 고급 튜터 DB 검증 도구 재설치

프로젝트 폴더에서 아래 순서로 실행합니다. 마지막으로 검증한 PGlite 버전은 `0.5.10`입니다.

```powershell
cd "C:\Users\ssemi\Documents\Goodlife\goodlife-journal"
npm install --prefix "..\.tutor-test-runtime" --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.10
$env:PGLITE_PACKAGE = (Resolve-Path "..\.tutor-test-runtime\node_modules\@electric-sql\pglite").Path
node --test tests/tutor-database.test.mjs tests/japanese-tutor-database.test.mjs
```

브라우저 테스트에는 별도로 Playwright와 Edge가 필요합니다. 기존 `PLAYWRIGHT_PACKAGE` 경로 설정을 사용합니다. 일반 개발을 계속하려면 앱 폴더에서 `npm run dev`만 실행하면 됩니다.

## 프로필 권한 및 라이브러리 보안 보완 (2026-10-19)

범위는 관리자 권한 변경 차단과 취약 라이브러리 업데이트뿐입니다. 앱 버전은 `0.2.12`를 유지하며 영수증 OCR, 다른 Edge Function, 화면, 기존 기록/계정 데이터는 변경하지 않았습니다.

### 운영 DB 적용 완료

`jllhaavazvyjjfqgnylb`에 `202610190005_enforce_profile_write_permissions.sql` 하나를 트랜잭션으로 적용했습니다. 전체 `db push`나 `schema.sql` 재실행은 하지 않았습니다. 새 migration은 재실행 가능하며 CLI의 migration 이력에는 자동 등록되지 않는 직접 SQL 적용 방식입니다.

- 일반 로그인 계정과 비로그인 계정의 `profiles.role`, `id`, `created_at` UPDATE 권한을 차단했습니다. 기존 테이블 권한뿐 아니라 별도로 남아 있을 수 있는 컬럼 권한과 PUBLIC 권한도 회수합니다.
- 로그인 계정은 본인의 `display_name`, `avatar_color`, `updated_at`만 수정할 수 있습니다. 브라우저에서도 해당 필드만 저장 요청에 포함합니다.
- INSERT는 본인 ID와 일반 회원 역할만 허용합니다. 제한적 RLS 정책을 추가해 다른 허용 정책이 있어도 본인 범위/일반 회원 역할을 넘어갈 수 없게 합니다.
- 기존 관리자 계정, 회원 목록 조회, 서버의 service-role 관리 권한, 가입 트리거는 유지했습니다. 개인 기록의 접근 정책도 변경하지 않았습니다.
- 운영 서버 재확인 결과: `authenticated`/`anon`의 role UPDATE는 false, 본인 이름/색상 UPDATE와 service-role의 role UPDATE는 true입니다. 운영 계정을 실제로 승격/강등하는 테스트는 하지 않았습니다.

다른 Supabase 프로젝트에 적용할 때는 전체 스키마가 아니라 위 migration만 실행하세요. 일반 사용자의 관리자 승격은 앱/브라우저에서 처리하지 않고 신뢰할 수 있는 서버나 관리자가 DB에서 수행해야 합니다. 의도적으로 기존 취약 권한을 다시 부여하는 롤백은 하지 않습니다.

### 라이브러리 업데이트

- Vite: `8.0.11` → `8.0.16` (8.0 계열 유지)
- PostCSS: `8.5.14` → `8.5.31`
- nanoid: `3.3.12` → `3.3.20`
- source-map-js: `1.2.1` → `1.2.2`
- ws: `8.20.0` → `8.22.0`
- 위 버전에 필요한 빌드 의존성과 잠금 파일도 갱신했습니다. `--force`를 사용하지 않았으며 React/Supabase SDK 주요 버전은 변경하지 않았습니다.
- 검사 시점의 `npm audit`: 높음 5건 → 전체 0건. 이는 알려진 라이브러리 취약점 검사 결과이며 앱 전체의 무결점 보증은 아닙니다.

로컬 소스는 커밋/push 전입니다. 라이브러리 변경은 GitHub push와 Vercel 재배포가 필요하며, 이미 실행 중인 로컬 개발 서버는 재시작해야 새 버전이 로드됩니다. DB 차단은 이미 운영에 적용되어 있고 Edge Function 재배포는 필요 없습니다.

### 검증

- `npm test`: 69개 통과, 1개 건너뜀(별도 Zepp 원본 샘플 없음).
- `npm run test:security`: 임시 PostgreSQL에서 5개 통과. 본인 권한 변경/관리자 역할 INSERT/upsert/타인 수정 차단, 정상 이름 수정, 서비스 권한, 재실행 및 기존 데이터 보존을 검증합니다.
- 튜터 DB 테스트: 영어/일본어 9개 통과.
- `npm run build`: 성공. 기존 큰 번들 안내 경고는 별도 최적화 대상으로 남겨 둡니다.
- `tests/browser-smoke.mjs`: 모바일 포함 4개 화면 크기, 기간 순환/수입 상세/한글 포커스/금액/저장 재시도/내비게이션 검증 통과. 운영 API 통신은 차단한 테스트입니다.

보안 DB 테스트는 위의 고급 튜터 DB 검증 도구 설치 절차로 PGlite를 준비한 뒤 실행합니다. 앱 의존성이나 운영 번들에 테스트 DB를 추가하지 않았습니다.

```powershell
$env:PGLITE_PACKAGE = (Resolve-Path "..\.tutor-test-runtime\node_modules\@electric-sql\pglite").Path
npm run test:security
```
