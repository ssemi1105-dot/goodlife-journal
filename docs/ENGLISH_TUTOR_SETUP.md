# Goodlife 영어 튜터 설치 안내: TheHive API (v0.2.9)

코드는 준비되어 있지만, 실제 사용 전에는 아래 1~5단계가 필요합니다.
기존 카테고리, records, 친구 공유, 사진 저장, KIS/TMDB/영수증 함수는 수정하지 않습니다.
**이번 연결은 DeepSeek 공식 API가 아니라 TheHive에서 제공하는 DeepSeek 모델입니다.**
이전 안내의 DEEPSEEK_API_KEY, DEEPSEEK_MODEL 및 이메일로 사용 허가하는 SQL은 필요 없습니다.
**Hive 키를 채팅, GitHub, Vercel 프론트 환경변수, 앱 입력칸에 넣지 마세요.**

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
**기존 schema.sql 전체 실행, db reset, 모든 migration 일괄 push는 필요 없습니다.**

## 2. TheHive API 키 등록하기

1. [TheHive](https://thehive.ai/)에 로그인하여 **Service API Keys**의 **V3 Secret Key**를 준비합니다.
2. Supabase의 **Goodlife 프로젝트 → Edge Functions → Secrets**로 들어갑니다.
3. 다음 항목을 하나씩 추가하고 **Save**를 누릅니다.

| Name / Key | Value |
| --- | --- |
| `HIVE_API_KEY` | 발급받은 실제 Hive V3 Secret Key |
| `HIVE_MODEL` | `deepseek-ai/deepseek-v4.1-flash-1017` |
| `TUTOR_GLOBAL_DAILY_LIMIT` | `100` |

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
프로젝트 이름 `goodlife`가 아니라 긴 영문 ID입니다. 아래 문구를 실제 ID로 바꿔 실행합니다.

```powershell
npx supabase functions deploy english-tutor --project-ref "실제_프로젝트_ID" --no-verify-jwt --use-api
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
5. `허용 · 하루 20회` 표시가 나오면 완료입니다. 저장 중에는 중복 조작을 막습니다.

OFF로 바꾸면 그 계정의 새 유료 요청이 차단됩니다. 이미 시작된 요청은 완료될 수 있습니다.
OFF는 대화 삭제가 아닙니다. 나중에 다시 ON하면 이전 수준·대화·복습을 이어서 사용합니다.
본인의 사용 권한을 OFF하더라도 관리자라면 회원관리에서 다시 ON할 수 있습니다.
관리자 판정은 기존 `profiles.role = owner/admin`을 서버에서 확인합니다. 일반 사용자가 개발자도구로 요청해도 변경할 수 없습니다.
권한 변경의 마지막 관리자 ID와 시각을 tutor_access에 저장합니다. 전체 변경 이력 기능은 아닙니다.
회원관리에서 상대방의 학습 수준·대화·교정 내용을 내려주거나 열람하는 기능은 추가하지 않았습니다.

`연결 필요`가 보이거나 스위치가 비활성 상태라면 SQL/함수 배포가 완료됐는지 확인한 후 **권한 다시 확인**을 누릅니다.
기존 회원 명단 자체도 안 보인다면 기존 `admin-list-users` 배포/관리자 역할부터 확인해야 합니다.

## 5. 앱에서 시험하기

1. 로컬 앱에 기존 계정으로 로그인합니다.
2. 홈에 `VERSION 0.2.9`가 보이는지 확인합니다.
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
git commit -m "0.2.9 Hive 영어 튜터 및 계정별 사용 권한 추가"
git push
```

Vercel과 GitHub 자동 배포가 연결되어 있다면 새 배포가 완료된 뒤 운영 주소에서 버전을 확인합니다.
**Git push는 Supabase SQL 적용이나 함수 배포를 대신하지 않습니다.**

## 사용하는 기능

- 대화: A2/B1/B1+ 난이도의 짧은 영어 대화, 한국어 교정 설명.
- 정확한 문장을 일부러 고치지 않도록 설계. 실제 교정과 선택적인 자연스러운 표현 제안을 분리.
- 한국어·혼합 문장은 영어 표현 예시를 별도로 표시하고, 한국어 자체를 문법 오류로 집계하지 않음.
- 복습: 최근 완료 대화 200회에서 교정된 표현 모음과 복습 완료 표시.
- 학습 설정: 수준 수동 변경, 자연스러운 표현 제안 ON/OFF, 오류 유형과 사용량 확인.
- 수준 추천: 같은 수준에서 평가 가능한 대화 20회와 한국 날짜 5일 이상 필요. 문장 길이·오류 밀도·모델 관측을 함께 확인. 추천만 하며 자동 변경하지 않음. CEFR 공인 진단이 아님.
- 음성: 지원 브라우저에서 음성 인식 후 문장을 직접 확인하고 전송. 영어 답변 읽어주기 지원.
- 브라우저 음성 인식은 별도 외부 서비스에 음성이 전송될 수 있음. 허락 확인 후 사용. 앱은 녹음 파일을 저장하지 않으며 발음 점수도 계산하지 않음.
- 새로고침 후 작성 중 문장 복원. 사용자별 sessionStorage에 초안·진행 요청 번호 저장. 탭을 닫으면 초안은 사라질 수 있음.
- 새 대화 생성, 대화 선택, 대화 삭제. 최대 50개 대화방, 방당 200회 요청.
- Hive의 SSE 응답은 서버에서 모아 검증한 뒤 화면에 한 번에 표시. 불완전한 응답은 저장/평가하지 않고 자동 유료 재시도도 하지 않음.

## 비용과 데이터 분리

기본값은 **계정당 하루 20회, 200,000 사용·예약 토큰 / 앱 전체 하루 100회**입니다.
한국 시간 자정 기준이며, 전체 앱 한도에 도달하면 개인 한도가 남아도 제한됩니다.
한 요청당 20,000토큰을 먼저 예약하고 완료 시 실제 사용량으로 정산합니다.
실패·결과 불명 요청은 예약을 유지하므로 20회 전에 토큰 한도에 도달할 수도 있습니다.
한도는 통제 장치이지 원화 기준 정확한 예산 보증은 아닙니다. Hive 조직 잔액과 사용량도 확인하세요.

- 요청 UUID로 중복 유료 호출 차단. 4초 간격 제한과 계정당 동시 요청 1개 제한.
- 오류, 오프라인, 시간 초과에는 입력을 지우지 않음. 저장 상태 확인은 같은 요청 ID를 사용.
- 120초 이상 불확실한 요청은 실패로 정리. 사용자 판단으로 다시 보낼 때만 새 호출 가능.
- 대화를 지워도 사용량은 초기화되지 않음.
- 학습 데이터는 `tutor_*` 전용 테이블에 저장. 관리자 권한 확인에만 기존 profiles.role을 읽음. `records`, 프로필, 병원, 투자, 사진, 친구 기록은 Hive에 보내지 않음.
- Hive에는 해당 계정·해당 대화방의 최근 최대 6회 대화, 기존 대화 요약, 현재 문장, 학습 수준만 전송. 사용자 ID·이메일을 API 메시지에 넣지 않음.
- API 키 하나를 서버에서 공유하지만 사용자별 학습 수준, 표현 제안 설정, 대화방, 대화 요약, 교정, 복습 완료, 추천과 사용량은 각각 분리. 공유하는 것은 공급자 결제 계정과 앱 전체 요청 한도뿐임.
- 모든 테이블은 본인만 읽도록 RLS 설정. 쓰기는 JWT 검증된 서버 함수만 수행. 앱 관리자도 다른 사람 튜터 기록을 읽는 권한은 추가하지 않음.
- Supabase 프로젝트 관리자는 DB 관리 권한으로 접근할 수 있음. 종단간 암호화 서비스는 아님.
- 대화 삭제 시 해당 대화·교정·복습·요약을 DB에서 삭제. 비용 통제용 날짜별 사용량은 유지.
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
| 오늘 사용량 소진 | 학습 설정 사용량, 한국 시간 자정, 전체 한도 |

키나 대화 전문을 오류 로그/스크린샷에 공개하지 마세요.

## 개발 파일과 검증

| 파일 | 역할 |
| --- | --- |
| `src/components/EnglishTutor.jsx` / `.css` | 튜터 전용 대화·복습·학습 설정 화면 |
| `src/hooks/useEnglishTutor.js` | 계정별 상태, 전송 잠금, 초안·결과 복구 |
| `src/services/tutorClient.js` | 로그인 토큰을 붙인 함수 호출, 구체적인 오류 표시 |
| `supabase/functions/english-tutor/index.ts` | Supabase 함수 진입점 |
| `supabase/functions/english-tutor/handler.mjs` | 인증, 소유권, 요청 제한, 관리자 권한 관리 |
| `supabase/functions/english-tutor/hiveProvider.mjs` | Hive V3 인증·요청·SSE 처리, 크기/시간 제한 |
| `supabase/functions/english-tutor/core.mjs` | 레벨별 프롬프트, 응답 검증, 교정·통계·추천 규칙 |
| `supabase/migrations/202610190001_english_tutor.sql` | 테이블 5개, RLS, 원자적 저장·사용량 예약 |
| `src/App.jsx` / `Dashboard.jsx` / `styles.css` | 홈 진입 버튼과 별도 화면 연결만 추가 |
| `src/components/AdminUserList.jsx` / `SettingsScreen.jsx` | 회원별 영어 튜터 토글, 저장/실패/재조회 상태, 계정 전환 분리 |

DB 저장 구조: tutor_access(허가), tutor_profiles(수준·설정), tutor_sessions(대화방·요약), tutor_turns(사용자 문장·검증된 답변·교정·상태), tutor_usage(날짜별 요청·토큰).

`npm test`에 교정/한국어 분리, 입력·응답 제한, 수준 추천 조건, 인증 실패 테스트가 포함됩니다.
DB 통합 테스트는 PGlite PostgreSQL로 SQL을 실제 실행하며, 브라우저 테스트는 실제 React 화면과 서버 함수를 연결합니다. 공급자 답변과 계정만 테스트용으로 대체하고 운영 네트워크는 차단합니다.

추가 테스트(개발 환경에 PGlite/Playwright 패키지가 설치되어 있거나 해당 절대 경로를 환경변수로 제공해야 함):

```powershell
node --test tests/tutor-database.test.mjs
node tests/tutor.browser.mjs
```

환경변수: `PGLITE_PACKAGE`, `PLAYWRIGHT_PACKAGE`. 서비스용 의존성에 테스트 도구를 추가할 필요는 없습니다.
실제 Hive Secret Key로 답변 품질·속도 확인, 운영 Supabase 배포 확인, 실제 안드로이드/아이폰의 한글 키보드·음성 권한 확인은 설정 완료 후 별도로 진행합니다.
