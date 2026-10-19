import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabaseClient';

const messages = {
  UNAUTHORIZED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  TUTOR_FORBIDDEN: '이 계정은 영어 튜터 사용 허가가 필요합니다. 관리자에게 요청해 주세요.',
  ADMIN_REQUIRED: '전체 회원 사용량 조회와 사용 권한 변경은 관리자만 가능합니다.',
  SERVER_UPDATE_REQUIRED: '사용량 화면 업데이트를 위해 english-tutor SQL 적용과 Edge Function 재배포가 필요합니다.',
  TARGET_USER_NOT_FOUND: '해당 회원을 찾을 수 없습니다. 회원 목록을 다시 확인해 주세요.',
  SETUP_REQUIRED: '영어 튜터 DB 또는 서버 설정이 아직 준비되지 않았습니다.',
  API_KEY_MISSING: 'Supabase에 HIVE_API_KEY를 등록해 주세요.',
  MODEL_NOT_CONFIGURED: '서버의 HIVE_MODEL 설정을 확인해 주세요.',
  PROVIDER_REGION_INVALID: 'HIVE_REGION은 global 또는 va1로 설정해 주세요.',
  DATABASE_ERROR: '학습 기록을 처리하지 못했습니다. 잠시 후 다시 확인해 주세요.',
  INVALID_INPUT: '입력 내용을 확인해 주세요. 메시지는 1,000자까지 보낼 수 있습니다.',
  VOICE_CONFIRMATION_REQUIRED: '음성 인식 문장을 확인한 후 전송해 주세요.',
  INPUT_TOO_LARGE: '메시지가 너무 깁니다. 내용을 줄여 주세요.',
  SESSION_NOT_FOUND: '대화를 찾을 수 없습니다. 대화 목록을 다시 불러와 주세요.',
  REQUEST_NOT_FOUND: '학습 기록을 찾을 수 없습니다.',
  REQUEST_BUSY: '이 계정의 다른 답변이 생성 중입니다. 잠시 후 확인해 주세요.',
  REQUEST_CONFLICT: '진행 중인 요청과 내용이 다릅니다. 먼저 저장 상태를 확인해 주세요.',
  REQUEST_EXPIRED: '이전 요청이 완료되지 않았습니다. 입력 내용은 유지됩니다.',
  SESSION_FULL: '이 대화가 200회에 도달했습니다. 새 대화를 시작해 주세요.',
  TOO_MANY_SESSIONS: '대화는 50개까지 보관할 수 있습니다. 이전 대화를 삭제해 주세요.',
  DAILY_LIMIT: '서버에 이전 일일 제한이 남아 있습니다. 최신 튜터 SQL을 적용해 주세요.',
  GLOBAL_LIMIT: '서버에 이전 전체 이용 제한이 남아 있습니다. 최신 튜터 SQL을 적용해 주세요.',
  RATE_LIMIT: '잠시만 기다렸다가 다시 전송해 주세요.',
  PROVIDER_BALANCE: 'Hive 조직이 중지되었거나 잔액이 부족합니다. 관리자에게 알려 주세요.',
  PROVIDER_AUTH: 'Hive API 인증에 실패했습니다. V3 Secret Key와 모델 사용 권한을 확인해 주세요.',
  PROVIDER_BUSY: 'Hive 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  PROVIDER_ERROR: 'Hive에 연결하지 못했습니다. 키·모델 설정 또는 서비스 상태를 확인해 주세요.',
  PROVIDER_TIMEOUT: '답변 대기 시간이 초과되었습니다. 입력 내용은 유지됩니다.',
  INVALID_MODEL_OUTPUT: '답변 형식을 확인하지 못해 학습 평가에 반영하지 않았습니다.',
  CONTEXT_TOO_LARGE: '대화 내용이 너무 깁니다. 새 대화를 시작해 주세요.',
  STATUS_UNKNOWN: '저장 결과를 확인하지 못했습니다. 새로 보내기 전에 저장 상태를 확인해 주세요.',
  NETWORK_ERROR: '서버에 연결하지 못했습니다. 인터넷과 함수 배포 상태를 확인해 주세요.',
  SERVER_ERROR: '영어 튜터 서버가 응답하지 않습니다. 잠시 후 다시 확인해 주세요.',
  FUNCTION_MISSING: 'english-tutor Edge Function이 아직 배포되지 않았습니다.',
};
export const tutorErrorMessage = code => messages[code] || messages.SERVER_ERROR;
export async function callTutor(action, body = {}) {
  if (!supabase || !SUPABASE_URL) throw Object.assign(new Error(messages.SETUP_REQUIRED), { code: 'SETUP_REQUIRED' });
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw Object.assign(new Error(messages.UNAUTHORIZED), { code: 'UNAUTHORIZED' });
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/english-tutor`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, action }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code = result?.code && messages[result.code] ? result.code : response.status === 401 ? 'UNAUTHORIZED' : response.status === 404 ? 'FUNCTION_MISSING' : response.status === 403 ? 'TUTOR_FORBIDDEN' : 'SERVER_ERROR';
      throw Object.assign(new Error(tutorErrorMessage(code)), { code, status: response.status });
    }
    if (!result || typeof result !== 'object') throw Object.assign(new Error(messages.SERVER_ERROR), { code: 'SERVER_ERROR' });
    if ((action === 'bootstrap' && (!result.usage?.today || !result.usage?.total)) ||
        (action === 'admin-access-list' && !Array.isArray(result.usage?.users))) {
      throw Object.assign(new Error(messages.SERVER_UPDATE_REQUIRED), { code: 'SERVER_UPDATE_REQUIRED' });
    }
    return result;
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(new Error(messages.NETWORK_ERROR), { code: 'NETWORK_ERROR' });
  } finally { clearTimeout(timeout); }
}
