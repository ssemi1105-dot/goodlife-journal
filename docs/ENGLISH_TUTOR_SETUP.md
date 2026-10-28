# Goodlife 영어·일본어 튜터 설치 안내: TheHive API (v0.2.14)

## 0.2.14: 짧은 회화·표현 연습·간격 복습 적용

이미 영어·일본어 튜터를 사용하는 경우, 아래 순서로 적용합니다. 이전 SQL은 다시 실행하지 않아도 됩니다.
기존 Hive 키, 사용 허가, 대화, 수준 설정, 토큰 사용량은 유지됩니다. 일일 제한을 다시 추가하지 않습니다.

1. Supabase SQL Editor에서 `supabase/migrations/202610280001_tutor_expression_review.sql` 전체를 실행합니다.
   기존 영어/일본어 튜터 SQL(202610190001~004)이 먼저 적용되어 있어야 합니다.
   새 테이블 `tutor_study_items`, `tutor_study_reviews`와 전용 함수만 추가합니다. `records`는 변경하지 않습니다.
2. 프로젝트 폴더에서 두 함수를 모두 배포합니다. 공통 파일도 함께 업로드되므로 한쪽만 배포하면 안 됩니다.

```powershell
cd "C:\Users\ssemi\Documents\Goodlife\goodlife-journal"
npx supabase functions deploy english-tutor --project-ref "jllhaavazvyjjfqgnylb" --no-verify-jwt --use-api
npx supabase functions deploy japanese-tutor --project-ref "jllhaavazvyjjfqgnylb" --no-verify-jwt --use-api
```

`--no-verify-jwt`는 함수 내부 인증을 끄지 않습니다. 두 함수는 기존처럼 `auth.getUser(jwt)`와 언어별 사용 허가를 직접 검증합니다.

3. 프론트 변경을 검토한 뒤 커밋·푸시하여 Vercel을 배포합니다. 홈에서 `VERSION 0.2.14`를 확인합니다.
4. 두 언어에서 주제 변경 → 카페 → 표현 익히기 → 따라 말하기 → 짧은 대화를 확인합니다.
   표현 저장 후 학습 메뉴 → 복습에서 다시 연습/어려웠어요/기억나요를 선택하고 새로고침해 일정이 유지되는지 확인합니다.

### 작동 방식

- `conversation.mjs`: 답변을 먼저 받는 작은 출력 규격을 사용합니다. 완성된 답변이 있으면 선택적인 교정/발음 누락 때문에 전체 대화를 실패시키지 않습니다. 잘린 JSON이나 미완료 스트림은 여전히 실패 처리합니다.
- `handler.mjs`: 인증/계정 소유권/요청 ID/실제 보고된 토큰 집계는 유지합니다. 자동 유료 재시도는 없으며 저장 상태 확인은 DB 조회만 합니다. 로그에는 진단 코드만 남기고 대화·키·계정 ID는 기록하지 않습니다.
- `lessons.mjs`: 기존 12개 영어/10개 일본어 주제에 자체 작성한 표현 3개씩을 제공합니다. 기본 표현·힌트·복습은 Hive 호출 없이 이용합니다. 음성 인식은 브라우저의 외부 서비스를 사용할 수 있고, 발음 자체를 채점하지는 않습니다.
- `TutorStudy.jsx`, `useTutorStudy.js`: 표현 확인, 기기 음성/직접 입력 연습, 3회 짧은 회화 안내, 표현 저장, 복습 일정, 삭제를 공통 구현합니다. 대화는 3회 이후에도 계속할 수 있습니다.
- 일본어는 원문+한글 근사 발음, 펼쳐 보는 한국어 뜻/가나를 제공합니다. API가 발음을 누락하면 만들어내지 않고 원문을 유지합니다.
- 새 간단 회화는 공식 수준 평가로 계산하지 않습니다. 기존 평가/교정 이력과 수동 수준 선택, 다른 표현 보기 설정은 유지됩니다.
- `study-list/save/grade/delete`는 로그인 계정과 함수의 언어를 서버에서 결정합니다. 클라이언트가 임의 학습 문장을 저장하도록 하지 않고, 자체 연습 자료 또는 본인의 완료된 답변에서만 선택합니다.
- RLS는 본인의 학습 표현/복습 이력 조회만 허용하고, 변경은 서버 전용입니다. 관리자 API 사용량 조회 권한이 타인의 대화/복습 내용 조회 권한으로 확대되지 않습니다.
- 복습은 다시 연습=10분 뒤, 어려움=1일 뒤, 기억남=1/3/7/14/30/60일 간격입니다. 응답 유실 후 같은 요청 ID로 재확인하면 일정이 중복 변경되지 않습니다. 저장된 표현을 삭제하면 그 표현의 복습 이벤트도 삭제됩니다.
- 대화를 삭제해도 별도로 저장한 표현은 유지됩니다. 복습 화면의 삭제 버튼으로 개별 삭제할 수 있으며 계정 삭제 시 함께 삭제됩니다.
- 표현은 언어별 최대 2,000개를 보관하고 목록은 500개씩 읽습니다. SQL/함수 미적용 시 안내 메시지를 표시하며 기존 대화 기능과 분리합니다.

### 검증

`npm test`, `npm run build` 및 기존 PostgreSQL 기반 튜터 테스트에 추가하여 아래를 실행합니다.
테스트용 DB와 모의 AI만 사용하므로 실제 사용자 데이터나 유료 API는 변경하지 않습니다.

```powershell
node --test tests/tutor-study-database.test.mjs tests/tutor-response-database.test.mjs
node tests/tutor-loading.browser.mjs
node tests/tutor-response.browser.mjs
```

기존 안내와 같이 `PGLITE_PACKAGE`와 `PLAYWRIGHT_PACKAGE` 환경변수를 테스트 도구 경로에 지정합니다.
실제 Hive 응답 시간·품질과 iPhone/Android 실기기 마이크는 별도 확인 대상입니다. 이번 코드 수정만으로 Hive 잔액/장애/잘못된 키까지 해결되는 것은 아닙니다.

---

아래는 최초 설치 및 이전 버전 안내입니다.

코드는 준비되어 있지만, 실제 사용 전에는 아래 1~5단계가 필요합니다.
기존 카테고리, records, 친구 공유, 사진 저장, KIS/TMDB/영수증 함수는 수정하지 않습니다.
**이번 연결은 DeepSeek 공식 API가 아니라 TheHive에서 제공하는 DeepSeek 모델입니다.**
이전 안내의 DEEPSEEK_API_KEY, DEEPSEEK_MODEL 및 이메일로 사용 허가하는 SQL은 필요 없습니다.
**Hive 키를 채팅, GitHub, Vercel 프론트 환경변수, 앱 입력칸에 넣지 마세요.**

## 이미 튜터를 사용 중인 경우: 이번 업데이트

기존 권한 토글과 Hive 키는 그대로 사용합니다. 다음 순서만 진행하세요.

1. Supabase의 **SQL Editor → New query**에서 [제한 해제·사용량 SQL](C:/Users/ssemi/Documents/Goodlife/goodlife-journal/supabase/migrations/202610190003_tutor_usage.sql) 파일의 전체 내용을 실행합니다.
   파일: `C:\Users\ssemi\Documents\Goodlife\goodlife-journal\supabase\migrations\202610190003_tutor_usage.sql`
   아직 0.2.10 주제 대화 SQL을 적용하지 않았다면 먼저 [주제 대화 SQL](C:/Users/ssemi/Documents/Goodlife/goodlife-journal/supabase/migrations/202610190002_tutor_coaching.sql)을 실행합니다. 기존 기록과 대화는 지우지 않습니다.
2. PowerShell에서 다음을 실행합니다. 기존에 CLI 로그인한 상태라면 다시 로그인할 필요가 없습니다.

```powershell
cd "C:\Users\ssemi\Documents\Goodlife\goodlife-journal"
npx supabase functions deploy english-tutor --project-ref "jllhaavazvyjjfqgnylb" --no-verify-jwt --use-api
```

3. 로컬 확인 후 아래 6단계의 빌드·커밋·푸시를 진행합니다. Vercel 배포가 Ready이면 홈에서 `VERSION 0.2.11`을 확인합니다.

- 계정별 일일 횟수·토큰 제한과 앱 전체 일일 제한을 모두 제거했습니다. 사용한 만큼 Hive API 사용료가 발생합니다.
- 본인 사용량: **영어 튜터 → 학습 설정 → 내 사용량·개인정보**에서 오늘·누적 토큰 확인.
- 관리자: **설정 → 회원관리**에서 전체 및 회원별 오늘·누적 토큰 확인. 새로고침 버튼은 사용량 조회만 하며 유료 AI를 호출하지 않습니다.
- 일반 계정은 본인 수치만 받습니다. 관리자는 사용량만 볼 수 있고 다른 사람의 대화·교정·학습 수준은 공개되지 않습니다.
- 기존 `TUTOR_GLOBAL_DAILY_LIMIT` Secret은 더 이상 사용하지 않습니다. 남아 있어도 제한이 걸리지 않으며 삭제는 선택입니다. Hive 키 재등록은 필요 없습니다.
- 과거 사용량에는 예약 수치가 섞여 있었습니다. 확인 가능한 실제 수치만 옮기고, 나머지는 **사용량 미확인**으로 표시합니다. 무료나 0토큰이라는 뜻이 아닙니다. 정확한 청구량은 Hive 대시보드를 확인하세요.

### 앞선 교정·주제 업데이트도 함께 유지

사용법: 영어 튜터에서 **+ (새 주제 선택)** → 식당/카페/여행 등 선택 → Mina의 첫 질문에 답하기.
처음 사용하는 계정은 주제 선택 화면부터 표시됩니다. **자유 대화**를 선택하면 먼저 말을 걸 수도 있습니다.

- 12개 주제, A2/B1/B1+ 각각의 첫 질문 총 36개. 첫 질문은 준비된 질문으로 **Hive 호출 없이** 즉시 시작합니다.
- 답변을 전송하면 완성 문장 → 핵심 교정 → Mina의 후속 질문 순서로 표시합니다. 적절한 문장을 억지로 고치지는 않습니다.
- 완성 문장 코칭은 기본 제공. 학습 설정의 **다른 표현도 함께 보기**는 추가 대안 표현만 켜고 끕니다. 기존 개인 설정값은 유지됩니다.
- **추천 문장 듣기**, **다시 말해보기** 지원. 인식된 문장은 확인 후 직접 전송하며 자동 제출하지 않습니다. 발음 평가 기능은 아닙니다.
- 기존 답변은 재호출하거나 일괄 재작성하지 않습니다. 새로 전송한 문장부터 개선된 코칭을 받습니다.
- 이전 대화·수준은 그대로 유지합니다. 사용량 화면은 새 집계 형식을 사용하므로 SQL → 함수 → 프론트 순서로 함께 업데이트합니다.

아래는 처음 설치하는 경우의 전체 안내입니다.

## 1. 튜터 전용 저장공간 만들기

1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인합니다.
2. Goodlife가 사용 중인 프로젝트를 선택합니다. 다른 프로젝트를 선택하지 않도록 주의합니다.
3. 왼쪽 **SQL Editor → New query**를 선택합니다.
4. 아래 파일의 전체 내용을 SQL 입력창에 붙여 넣고 **Run**을 누릅니다.

[튜터 SQL 열기](C:/Users/ssemi/Documents/Goodlife/goodlife-journal/supabase/migrations/202610190001_english_tutor.sql)

파일 경로:

```text
C:\Users\ssemi\Documents\Goodlife\goodlife-journal\supabase\migrations\202610190001_english_tutor.sql
```

`Success. No rows returned`처럼 오류 없는 결과가 나오면 완료입니다.
튜터 테이블 5개, 사용자별 읽기 정책, 서버 전용 저장·권한 변경 함수를 만듭니다.
기존 profiles.role을 읽어 관리자인지 판별하지만, 기존 프로필이나 역할을 변경하지 않습니다.
이 SQL은 다시 실행해도 튜터 기록을 지우지 않습니다.
이어서 [주제 대화 SQL](C:/Users/ssemi/Documents/Goodlife/goodlife-journal/supabase/migrations/202610190002_tutor_coaching.sql), [사용량 SQL](C:/Users/ssemi/Documents/Goodlife/goodlife-journal/supabase/migrations/202610190003_tutor_usage.sql)을 차례로 실행합니다. 순서는 `...0001` → `...0002` → `...0003`입니다. 마지막 SQL이 일일 제한을 해제하므로 0001만 다시 적용하지 마세요.
**기존 schema.sql 전체 실행, db reset, 모든 migration 일괄 push는 필요 없습니다.**

## 2. TheHive API 키 등록하기

1. [TheHive](https://thehive.ai/)에 로그인하여 **Service API Keys**의 **V3 Secret Key**를 준비합니다.
2. Supabase의 **Goodlife 프로젝트 → Edge Functions → Secrets**로 들어갑니다.
3. 다음 항목을 하나씩 추가하고 **Save**를 누릅니다.

| Name / Key | Value |
| --- | --- |
| `HIVE_API_KEY` | 발급받은 실제 Hive V3 Secret Key |
| `HIVE_MODEL` | `deepseek-ai/deepseek-v4.1-flash-1017` |

`HIVE_REGION`은 생략하면 `global`입니다. Hive에서 별도로 Virginia/VA1 고객으로 안내받았다면 `va1`로 추가합니다.
키가 **Access Key ID**인지 **Secret Key**인지 확인하세요. 이 기능에는 Secret Key가 필요합니다.
기존 이미지 분석용 V2 프로젝트 키(`authorization: token ...`)와 다릅니다.
필요하면 Service API Keys → Create API Key에서 새 키를 만들고 표시되는 Secret Key를 Supabase에 등록합니다.

키 값에는 따옴표나 `Bearer `를 붙이지 않습니다.
`VITE_HIVE_API_KEY`처럼 이름을 바꾸면 안 됩니다.
Vercel에 이 키를 추가할 필요는 없습니다. 기존 Vite Supabase URL/공개 키는 그대로 둡니다.
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 배포된 Supabase 함수가 제공하는 서버 환경값을 사용합니다. 프론트로 복사하지 않습니다.
기존 KIS, TMDB, 영수증용 Secrets는 수정하거나 삭제하지 않습니다.

모델명과 요청 형식은 2026-10-19 [Hive 모델 공식 문서](https://docs.thehive.ai/docs/deepseek-v41-flash) 기준입니다.
기본 호출 주소는 `https://api-cdn.thehive.ai/api/v3/chat/completions`이며, VA1은 `https://api-va1.thehive.ai/api/v3/chat/completions`입니다.
임의의 URL에 Secret Key가 전송되지 않도록 이 두 주소와 위 모델만 허용합니다. HTTP 리다이렉트도 따라가지 않습니다.
V3 키 방식은 [Hive Chat Completions 공식 안내](https://docs.thehive.ai/docs/chat-completions-openai-compatible-llms)를 따릅니다.
Hive 호출에는 `reasoning_effort: none`, `max_completion_tokens: 1400`을 사용합니다. DeepSeek 공식 API 전용 설정을 그대로 보내지 않습니다.
Secrets 등록 방식은 [Supabase 공식 안내](https://supabase.com/docs/guides/functions/secrets)를 따릅니다.

## 3. 영어 튜터 함수 하나만 배포하기

PowerShell에서 다음 순서대로 실행합니다.

```powershell
cd "C:\Users\ssemi\Documents\Goodlife\goodlife-journal"
npx supabase login
```

첫 실행에 설치 여부를 물으면 `y`를 입력합니다. 브라우저에서 Supabase 로그인을 완료합니다.
이 로그인은 **Hive 키 입력 단계가 아닙니다.**

프로젝트 ID는 Supabase 프로젝트 화면의 **Settings → General → Reference ID** 또는 주소의 `/project/` 다음 문자열입니다.
프로젝트 이름 `goodlife`가 아니라 긴 영문 ID입니다. 현재 확인된 Goodlife 프로젝트 ID를 아래에 넣었습니다.

```powershell
npx supabase functions deploy english-tutor --project-ref "jllhaavazvyjjfqgnylb" --no-verify-jwt --use-api
```

`--use-api`는 Docker 없이 서버 측에서 묶어 배포하는 옵션입니다.
`english-tutor`라는 이름을 빼지 마세요. 이번에 추가한 함수 하나만 배포합니다.
`index.ts`뿐 아니라 같은 폴더의 `handler.mjs`, `core.mjs`, `hiveProvider.mjs`도 함께 배포됩니다.
기존 `admin-list-users` 함수를 재배포할 필요는 없습니다. 기존 회원 목록 조회는 유지하고, 권한 관리는 `english-tutor`가 별도로 처리합니다.

**`--no-verify-jwt`에 대한 보안 설명:** Supabase 게이트웨이의 레거시 JWT 검사만 끕니다.
함수 내부에서 매 요청마다 `auth.getUser(JWT)`로 로그인을 검증하고, 허용 계정과 대화 소유권을 다시 확인합니다.
로그인하지 않은 요청은 401, 미허용 계정은 403으로 거절됩니다. 공개 유료 호출 함수가 아닙니다.
다른 함수의 JWT 설정은 바꾸지 않습니다.

Supabase **Edge Functions** 목록에서 `english-tutor`가 보이면 배포 완료입니다.
브라우저로 함수 URL을 직접 열면 GET 요청이므로 정상 채팅 테스트가 아닙니다.
배포 옵션은 [Supabase CLI 공식 안내](https://supabase.com/docs/reference/cli/supabase-functions-deploy)를 참고하세요.

## 4. 설정 화면에서 본인과 가족 계정 허용하기

비용을 막기 위해 기본값은 모든 계정 사용 불가입니다. 앱 관리자도 자동 허용하지 않습니다.

1. 로컬 Goodlife에서 관리자 계정으로 로그인합니다.
2. **설정 → 회원관리**를 펼칩니다.
3. 본인 계정 아래의 **영어 튜터** 스위치를 ON으로 바꿉니다.
4. 아내분 계정 아래의 **영어 튜터** 스위치도 ON으로 바꿉니다.
5. `허용 · 일일 제한 없음` 표시가 나오면 완료입니다. 저장 중에는 중복 조작을 막습니다.

OFF로 바꾸면 그 계정의 새 유료 요청이 차단됩니다. 이미 시작된 요청은 완료될 수 있습니다.
OFF는 대화 삭제가 아닙니다. 나중에 다시 ON하면 이전 수준·대화·복습을 이어서 사용합니다.
본인의 사용 권한을 OFF하더라도 관리자라면 회원관리에서 다시 ON할 수 있습니다.
관리자 판정은 기존 `profiles.role = owner/admin`을 서버에서 확인합니다. 일반 사용자가 개발자도구로 요청해도 변경할 수 없습니다.
권한 변경의 마지막 관리자 ID와 시각을 tutor_access에 저장합니다. 전체 변경 이력 기능은 아닙니다.
회원관리에서 상대방의 학습 수준·대화·교정 내용을 내려주거나 열람하는 기능은 추가하지 않았습니다.

`연결 필요`가 보이거나 스위치가 비활성 상태라면 SQL/함수 배포가 완료됐는지 확인한 후 **다시 확인**을 누릅니다.
기존 회원 명단 자체도 안 보인다면 기존 `admin-list-users` 배포/관리자 역할부터 확인해야 합니다.

## 5. 앱에서 시험하기

1. 로컬 앱에 기존 계정으로 로그인합니다.
2. 홈에 `VERSION 0.2.11`이 보이는지 확인합니다.
3. 홈 **전체 카테고리** 맨 앞의 **영어 튜터** 카드를 누릅니다. 요약 영역 아래의 작은 **영어 튜터 ↗** 버튼으로도 들어갈 수 있습니다.
4. `I ate apple yesterday.`처럼 짧은 문장을 보냅니다. 이 단계부터 실제 Hive API 비용이 발생합니다.
5. 영어 답변, 교정, 한국어 설명이 표시되는지 확인합니다. 교정 품질은 AI 특성상 매번 동일하지 않습니다.
6. 홈으로 갔다 다시 튜터에 들어와 대화가 유지되는지 확인합니다.
7. 복습 탭에서 교정 내용을 확인하고, 학습 설정에서 A2/B1/B1+를 선택합니다.
8. 아내분은 본인 계정으로 로그인해 학습 설정에서 별도 수준을 선택합니다. 서로의 대화가 보이지 않는지 확인합니다.
9. 관리자가 아내분 권한을 잠시 OFF한 뒤 새 메시지가 차단되는지 확인합니다. 다시 ON하면 계속 사용할 수 있습니다.

로컬 앱이 실행되지 않았다면:

```powershell
cd "C:\Users\ssemi\Documents\Goodlife\goodlife-journal"
npm run dev -- --host 127.0.0.1
```

터미널에 나오는 Local 주소로 접속합니다. 이 화면을 쓰는 동안 해당 터미널을 닫지 않습니다.
기존 개발 서버가 실행 중이면 중복 실행하지 않아도 됩니다.

## 6. 웹사이트에 반영하기

로컬 확인 후 다음을 실행합니다. 아래 명령은 안내용이며 이번 개발에서 자동 push하지 않았습니다.

```powershell
cd "C:\Users\ssemi\Documents\Goodlife\goodlife-journal"
npm test
npm run build
git status
git add .
git commit -m "0.2.11 영어 튜터 일일 제한 해제 및 사용량 조회 추가"
git push
```

Vercel과 GitHub 자동 배포가 연결되어 있다면 새 배포가 완료된 뒤 운영 주소에서 버전을 확인합니다.
**Git push는 Supabase SQL 적용이나 함수 배포를 대신하지 않습니다.**

## 사용하는 기능

- 대화: A2/B1/B1+ 난이도의 짧은 영어 대화, 한국어 교정 설명.
- 정확한 문장을 일부러 고치지 않도록 설계. 실제 문법 교정과 자연스러운 완성 문장 제안을 분리.
- 한국어·혼합 문장은 영어 표현 예시를 별도로 표시하고, 한국어 자체를 문법 오류로 집계하지 않음.
- 복습: 최근 완료 대화 200회에서 교정·완성 문장·번역 예시 모음과 복습 완료 표시.
- 학습 설정: 수준 수동 변경, 추가 대안 표현 ON/OFF, 오류 유형과 사용량 확인.
- 수준 추천: 같은 수준에서 평가 가능한 대화 20회와 한국 날짜 5일 이상 필요. 문장 길이·오류 밀도·모델 관측을 함께 확인. 추천만 하며 자동 변경하지 않음. CEFR 공인 진단이 아님.
- 음성: 지원 브라우저에서 음성 인식 후 문장을 직접 확인하고 전송. 영어 답변 읽어주기 지원.
- 브라우저 음성 인식은 별도 외부 서비스에 음성이 전송될 수 있음. 허락 확인 후 사용. 앱은 녹음 파일을 저장하지 않으며 발음 점수도 계산하지 않음.
- 새로고침 후 작성 중 문장 복원. 사용자별 sessionStorage에 초안·진행 요청 번호 저장. 탭을 닫으면 초안은 사라질 수 있음.
- 새 대화 생성, 대화 선택, 대화 삭제. 최대 50개 대화방, 방당 200회 요청.
- Hive의 SSE 응답은 서버에서 모아 검증한 뒤 화면에 한 번에 표시. 불완전한 응답은 저장/평가하지 않고 자동 유료 재시도도 하지 않음.

## 비용과 데이터 분리

**앱의 모든 일일 횟수·토큰 제한을 제거했습니다.** Hive 자체의 잔액·서비스 제한은 별개입니다.
오늘 집계는 한국 시간 자정 기준, 누적 집계는 보관된 모든 날짜 기준입니다.
서버가 받은 `usage.total_tokens`만 실제 확인된 입력·출력 토큰으로 집계합니다. 더 이상 가상 토큰을 예약하지 않습니다.
사용량 정보 없이 끝난 요청, 처리 중 요청, 일부 이전 기록은 미확인 건수로 따로 표시합니다. 미확인은 무료 또는 0토큰을 의미하지 않습니다.
잘못된 교정 형식이나 잘린 응답이어도 공급자 사용량을 받았다면 합산합니다. 같은 요청의 재조회·재정산은 중복 합산하지 않습니다.
기존 20,000 값은 실제 사용량인지 예약인지 구별할 수 없어 보수적으로 미확인 처리하며, 삭제된 대화의 옛 예약 합계도 실제 토큰이라고 표시하지 않습니다.
사용량을 알고 있는 일부 이전 완료 요청은 자동 이관합니다. 일일 합계는 삭제하지 않고, 이관 SQL을 다시 실행해도 새 집계가 초기화되지 않습니다.
**사용 횟수가 늘면 비용도 늘어납니다.** 정확한 청구량과 비용은 Hive 조직 대시보드에서도 확인하세요.

- 요청 UUID로 중복 유료 호출 차단. 4초 간격 제한과 계정당 동시 요청 1개 제한.
- 오류, 오프라인, 시간 초과에는 입력을 지우지 않음. 저장 상태 확인은 같은 요청 ID를 사용.
- 120초 이상 불확실한 요청은 실패로 정리. 사용자 판단으로 다시 보낼 때만 새 호출 가능.
- 대화를 지워도 사용량은 초기화되지 않음.
- 학습 데이터는 `tutor_*` 전용 테이블에 저장. 관리자 권한 확인에만 기존 profiles.role을 읽음. `records`, 프로필, 병원, 투자, 사진, 친구 기록은 Hive에 보내지 않음.
- Hive에는 해당 계정·해당 대화방의 주제·첫 질문, 최근 최대 6회 대화와 연습용 예문, 기존 대화 요약, 현재 문장, 학습 수준만 전송. 사용자 ID·이메일을 API 메시지에 넣지 않음.
- API 키 하나를 서버에서 공유하지만 사용자별 학습 수준, 표현 제안 설정, 대화방, 대화 요약, 교정, 복습 완료, 추천과 사용량은 각각 분리. 공유하는 것은 공급자 결제 계정뿐임.
- 모든 테이블은 본인만 읽도록 RLS 설정. 쓰기는 JWT 검증된 서버 함수만 수행. 앱 관리자도 다른 사람 튜터 기록을 읽는 권한은 추가하지 않음.
- Supabase 프로젝트 관리자는 DB 관리 권한으로 접근할 수 있음. 종단간 암호화 서비스는 아님.
- 대화 삭제 시 해당 대화·교정·복습·요약을 DB에서 삭제. 날짜별 요청·실제 사용량 집계는 유지.
- 회원관리의 전체 사용량 조회는 Edge Function과 DB 함수 양쪽에서 `profiles.role=owner/admin` 검사. 브라우저에는 합계만 반환하며 사용량 테이블 RLS는 그대로 본인만 조회 가능.
- Hive/브라우저 음성 서비스 측 보관은 각각의 정책을 따름. 앱에서 대화를 지운다고 외부 사업자 기록까지 삭제되는 것은 아님.
- 기존 설정의 기록 백업/복원은 그대로 유지. **튜터 학습 데이터는 기존 기록 백업에 포함되지 않음.** 별도 보관이 필요하면 Supabase에서 `tutor_*` 데이터를 백업.

사용 허가 변경은 **설정 → 회원관리 → 계정별 영어 튜터 토글**에서 합니다. 매번 SQL을 실행하지 않아도 됩니다.

## 오류가 보일 때

| 표시 내용 | 확인할 곳 |
| --- | --- |
| 사용 허가 필요 | 4단계 회원관리의 계정별 토글 |
| 함수 배포 필요 | 3단계 함수 이름, 프로젝트 ID |
| 서버/DB 준비 필요 | 1단계 SQL 전체 실행 여부 |
| API 키 미등록 | 2단계 HIVE_API_KEY 정확한 이름과 값 |
| Hive 인증 실패 | V3 Secret Key인지, 모델 사용이 허용된 조직인지 확인 |
| 모델 설정 오류 | HIVE_MODEL이 deepseek-ai/deepseek-v4.1-flash-1017인지 확인 |
| Hive 조직 중지/잔액 부족 | Hive 조직 잔액·활성 상태·이용 정책 확인. HTTP 405도 이 유형 |
| 네트워크 연결 실패 | 인터넷, Supabase 함수 URL, 함수 배포 상태 |
| 로그인 만료 | 로그아웃 후 재로그인 |
| 저장 상태 확인 | 잠시 뒤 같은 버튼으로 상태 확인. 새 대화를 중복 전송하지 않기 |
| 이전 일일 제한이 남아 있음 | ...0003_tutor_usage.sql 적용 후 english-tutor 재배포 |
| 사용량 화면 업데이트 필요 | 최신 SQL, 함수 배포와 프론트 버전 모두 확인 |

키나 대화 전문을 오류 로그/스크린샷에 공개하지 마세요.

## 개발 파일과 검증

| 파일 | 역할 |
| --- | --- |
| `src/components/EnglishTutor.jsx` / `.css` | 튜터 전용 대화·복습·학습 설정 화면 |
| `src/components/TutorFeedback.jsx` / `TutorTopics.jsx` | 완성 문장·수정 전후·듣기·연습, 주제 선택 |
| `src/components/TutorUsageSummary.jsx` / `.css` | 본인·회원별·전체 토큰 집계 공통 표시 |
| `src/hooks/useEnglishTutor.js` | 계정별 상태, 전송 잠금, 초안·결과 복구 |
| `src/services/tutorClient.js` | 로그인 토큰을 붙인 함수 호출, 구체적인 오류 표시 |
| `supabase/functions/english-tutor/index.ts` | Supabase 함수 진입점 |
| `supabase/functions/english-tutor/handler.mjs` | 인증, 소유권, 요청 제한, 관리자 권한 관리 |
| `supabase/functions/english-tutor/hiveProvider.mjs` | Hive V3 인증·요청·SSE 처리, 크기/시간 제한 |
| `supabase/functions/english-tutor/core.mjs` | 레벨별 프롬프트, 응답 검증, 교정·통계·추천 규칙 |
| `supabase/functions/english-tutor/topics.mjs` | 클라이언트/서버 공통 공개 주제·레벨별 첫 질문. 키·설정 없음 |
| `supabase/migrations/202610190001_english_tutor.sql` | 테이블 5개, RLS, 원자적 저장·사용량 예약 |
| `supabase/migrations/202610190002_tutor_coaching.sql` | 주제·첫 질문 저장, 멱등 주제 생성. 기존 RLS 유지 |
| `supabase/migrations/202610190003_tutor_usage.sql` | 일일 제한 제거, 실제 토큰 이관·멱등 집계, 관리자 집계 조회 |
| `src/App.jsx` / `Dashboard.jsx` / `styles.css` | 홈 진입 버튼과 별도 화면 연결만 추가 |
| `src/components/AdminUserList.jsx` / `SettingsScreen.jsx` | 회원별 영어 튜터 토글, 저장/실패/재조회 상태, 계정 전환 분리 |

DB 저장 구조: tutor_access(허가), tutor_profiles(수준·설정), tutor_sessions(대화방·요약), tutor_turns(사용자 문장·검증된 답변·교정·상태), tutor_usage(날짜별 요청·토큰).
사용량 추가: `tutor_turns.reported_tokens`(null이면 미확인), `tutor_usage.reported_tokens`, `reported_requests`. 미확인 건수는 `requests - reported_requests`. 이전 `tokens`, `charged_tokens`는 호환용이며 화면의 실제 토큰 계산에는 사용하지 않습니다. `tutor_access.daily_limit/daily_token_limit`는 남겨 두지만 집행하지 않습니다.
추가 저장: `tutor_sessions.topic_id`, `tutor_sessions.opening={question,situation,role,level}`. `tutor_turns.feedback.natural={sentence,explanation_ko}`는 기존 JSON에 추가되며, 과거 답변에는 없거나 null일 수 있습니다. 문법 교정 `errors/corrected`와 분리하며, 추가 문법 오류로 집계하지 않습니다.

`npm test`에 교정/한국어 분리, 입력·응답 제한, 수준 추천 조건, 인증 실패 테스트가 포함됩니다.
DB 통합 테스트는 PGlite PostgreSQL로 SQL을 실제 실행하며, 브라우저 테스트는 실제 React 화면과 서버 함수를 연결합니다. 공급자 답변과 계정만 테스트용으로 대체하고 운영 네트워크는 차단합니다.

추가 테스트(개발 환경에 PGlite/Playwright 패키지가 설치되어 있거나 해당 절대 경로를 환경변수로 제공해야 함):

```powershell
node --test tests/tutor-database.test.mjs
node tests/tutor.browser.mjs
```

환경변수: `PGLITE_PACKAGE`, `PLAYWRIGHT_PACKAGE`. 서비스용 의존성에 테스트 도구를 추가할 필요는 없습니다.
실제 Hive Secret Key로 답변 품질·속도 확인, 운영 Supabase 배포 확인, 실제 안드로이드/아이폰의 한글 키보드·음성 권한 확인은 설정 완료 후 별도로 진행합니다.

## 한글·혼합 입력 표현 코칭 (2026-10-19)

- 한글로 의미를 전달하면 완성된 영어 문장과 함께 **이럴 땐 이렇게 말해요**를 표시합니다. 혼합 문장은 이미 맞게 쓴 영어를 최대한 보존하고 한글로 적은 부분의 표현을 설명합니다.
- A2는 핵심 표현 1개, B1/B1+는 최대 2개입니다. 각 표현은 원문의 한글 부분, 추천 영어, 상황/재사용 패턴에 대한 짧은 한국어 설명으로 구성됩니다. `다른 표현도 함께 보기`가 꺼져 있어도 이 코칭은 제공됩니다.
- 기존 `feedback.english_version`에 전체 문장을, 새 `feedback.expression_tips` 배열에 `{source,sentence,explanation_ko}`를 저장합니다. source는 실제 입력의 한글 포함 부분이어야 하고 sentence는 전체 추천 문장에 실제로 있어야 합니다. 허위/중복 매핑은 버립니다.
- 의미가 불명확하면 `flags.meaning_unclear`로 번역·교정을 보류하고 확인 질문을 합니다. 음성 인식 불확실/민감/주제 이탈 상황도 설명을 억지로 생성하지 않습니다. 한글 부분을 문법 오류로 집계하거나 번역문을 학습자의 실력으로 평가하지 않습니다.
- 문장 듣기와 **이 표현으로 연습하기**는 기존 연습 흐름을 사용합니다. 자동 전송하지 않고 작성 중 초안도 확인 없이 지우지 않습니다. 복습에서도 같은 설명을 확인할 수 있습니다.
- 설명은 기존 Hive 응답 한 번에 포함하므로 추가 API 호출은 없습니다. 프롬프트/설명 길이만큼 토큰 사용량은 늘 수 있으며 출력 상한 1,400토큰, 인증/계정 권한/사용량 집계는 유지됩니다.
- SQL 변경은 필요 없습니다. 기존 JSONB를 사용하며 이전 대화는 설명 필드가 없어도 표시됩니다. 기존 대화에 설명을 소급 생성하거나 유료 요청을 다시 보내지 않습니다.
- `english-tutor`, `japanese-tutor`를 프로젝트 `jllhaavazvyjjfqgnylb`에 재배포했습니다. 프론트는 아직 Git push 전이므로 운영 화면에는 프론트 배포도 필요합니다. 다른 API/카테고리는 변경하지 않았습니다.

검증: `npm test` 74개 통과/샘플 파일 테스트 1개 건너뜀, 튜터 DB 테스트 10개 통과, 빌드 성공. 테스트용 모델 응답으로 저장/재조회/복습/사용자 분리/중복 과금 방지를 검증했습니다. 실제 유료 Hive 호출은 하지 않았습니다.

```powershell
node --test tests/tutor-database.test.mjs tests/japanese-tutor-database.test.mjs tests/tutor-coaching-database.test.mjs
node tests/tutor-coaching.browser.mjs
```

앞 절차대로 PGlite/Playwright 경로 환경변수가 필요합니다. 브라우저 테스트는 320/390/1024px에서 영어·일본어 듣기/연습/초안 보존/복습을 검사하며 운영 네트워크를 차단합니다.

## Mina 페르소나 보완 (2026-10-19)

- `supabase/functions/english-tutor/persona.mjs`에서 성격과 지도 방식을 관리하며 `core.mjs`가 매 요청의 시스템 지침에 포함합니다.
- 다정하지만 정확한 성인 회화 코치입니다. 기계적인 칭찬 대신 실제로 잘 사용한 표현을 짚고, 진짜 오류와 단순한 표현 대안을 구분합니다. 쉬운 한국어 설명과 학습자의 의도를 우선합니다.
- 다음 행동은 확인 질문 / 설명 / 선택적 한 번 재도전 / 응용 질문 / 마무리 중 하나입니다. 재도전 요청과 새 질문을 동시에 하지 않고, 재도전은 매번 요구하지 않습니다. 같은 뜻의 올바른 다른 표현도 인정합니다.
- 재도전 뒤에는 구체적인 변화만 짚고 응용으로 넘어갑니다. 아직 틀리면 짧게 모델 표현을 보여주되 재시도를 계속 강요하지 않습니다. 건너뛰기·주제 변경·설명 요청·종료 의사를 존중합니다.
- 기존 출력 구조, 교정 제한, 계정 분리, 한글 코칭과 사용량 집계는 그대로입니다. 추가 API 호출이나 SQL 변경은 없습니다. 시스템 지침이 길어진 만큼 입력 토큰은 증가할 수 있습니다.
- 기억은 여전히 현재 대화의 최근 최대 6회와 600자 요약뿐입니다. 같은 대화에서 연습한 핵심 표현 하나를 요약할 수 있지만, 대화방 간 장기 기억·자동 복습 일정·개인별 학습 계획은 추가하지 않았습니다. 프롬프트 기반 지도 지침이며 재도전 상태를 별도 DB 상태 머신으로 강제하지 않습니다.
- 배포: `npx supabase functions deploy english-tutor --project-ref jllhaavazvyjjfqgnylb --no-verify-jwt --use-api`. 프론트 변경은 없고 기존 답변은 다시 생성하지 않습니다.

검증 범위: `npm test`는 모든 수준·주제에 페르소나가 들어가는지, 재도전 문맥과 원래 입력이 유지되는지, 길이 제한·기존 교정·인증이 유지되는지 검사합니다. 모델의 실제 말투를 평가하는 유료 호출 테스트는 아닙니다.

실제 대화 확인 예: `오늘 회사에서 너무 바빴어.` → 핵심 표현 설명과 필요시 한 번 연습 제안. 제안 문장 또는 같은 뜻의 다른 표현으로 답하면 새 상황 질문으로 진행. `다음으로 넘어가자`나 `설명해줘`에는 반복 강요 없이 대응해야 합니다. 이미 자연스러운 `I went home yesterday.`를 억지로 교정하거나 연습시켜서는 안 됩니다.

적용 결과: 2026-10-19 두 튜터 함수를 위 프로젝트에 재배포했습니다. `npm test` 78개 통과/기존 샘플 파일 테스트 1개 건너뜀, `npm run build` 성공(기존 500KB 번들 경고 유지). 배포된 두 함수 모두 인증 없는 요청에 `401 UNAUTHORIZED`를 반환했습니다. 실제 유료 모델 호출, 운영 대화 데이터 수정, Git 커밋/push는 하지 않았습니다. 서버의 새 응답부터 적용되며 프론트 재배포는 필요 없습니다.

## 답변 처리 실패 보완 (2026-10-19)

- 보고 문장: `I always using the air conditioner.`. 종전에는 답변 전체가 처리되지 않았는데도 화면에 "학습 평가에 반영하지 않았습니다"만 표시했습니다. 실제 당시 원문 응답은 저장하지 않았으므로 과거 실패의 정확한 필드까지 단정할 수 없습니다.
- 재현한 취약점: 완성된 JSON에 코드 블록이 붙거나 선택 정보인 `level_signal`, `improvements`, `memory`가 null이면 유효한 교정과 대화까지 버렸습니다. 완결된 단일 JSON 코드 블록만 허용하고 선택 정보의 누락은 교정 저장과 분리했습니다. 잘린 JSON, 필수 안전 플래그, 필수 교정/읽기 정보는 여전히 검증합니다.
- 영어 평가 정보가 없으면 교정과 대화만 저장하고 수준 평가는 제외합니다. 평가나 교정 내용을 서버가 지어내지 않습니다. 요약이 없으면 기존 대화 요약을 보존합니다. 8단어 미만 답변도 교정을 받을 수 있습니다.
- `handler.mjs`는 실패 단계와 제한된 사유 코드만 로그에 남깁니다. `tutor_response_rejected` 이벤트의 `stage`, `reason`, 공급자가 보고한 토큰 수를 확인하세요. 원문, AI 답변, 사용자 ID, 키는 로그에 넣지 않습니다. 사유는 길이 제한, 스트림 미완료, JSON 오류, 필수 정보 오류 등으로 구분합니다.
- `src/services/tutorClient.js`는 답변 처리 실패임을 명확히 표시하고 수신된 사유가 있으면 함께 안내합니다. 과거 실패 기록에는 상세 사유가 없어 일반 안내를 표시합니다. 초안 보존, 동일 요청 멱등 처리, 유료 자동 재시도 금지와 실제 토큰 집계는 유지합니다. "다시 확인"은 저장 상태만 확인하며, 새 제출은 별도 유료 요청입니다.
- SQL, API 키, 출력 토큰 상한, 버전 변경은 없습니다. 기존 실패 대화를 자동 재생성하지 않습니다. 영어·일본어 함수를 `jllhaavazvyjjfqgnylb`에 재배포했으며 두 함수의 인증 없는 요청은 `401 UNAUTHORIZED`였습니다. 프론트 오류 안내는 Git push 후 Vercel 배포가 필요합니다.

검증: `npm test` 84개 통과/기존 Zepp 샘플 테스트 1개 건너뜀, PostgreSQL 통합 테스트 11개 통과, `npm run build` 성공(기존 500KB 번들 경고). 격리된 브라우저 320/390px에서 영어·일본어 저장/재조회/초안 유지/실패 안내/자동 유료 재호출 없음 검사를 통과했습니다. 실제 Hive 응답은 테스트용으로 대체했으며 유료 모델 호출이나 운영 대화 수정은 하지 않았습니다.

```powershell
node --test tests/tutor-response-database.test.mjs tests/tutor-database.test.mjs tests/japanese-tutor-database.test.mjs tests/tutor-coaching-database.test.mjs
node tests/tutor-response.browser.mjs
```

앞 절차처럼 PGlite/Playwright 경로 환경변수를 사용합니다. 실제 스마트폰 음성 서비스나 실제 모델의 응답 품질을 보장하는 테스트는 아닙니다.
