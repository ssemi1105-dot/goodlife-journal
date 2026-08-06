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
