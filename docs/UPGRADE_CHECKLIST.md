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
