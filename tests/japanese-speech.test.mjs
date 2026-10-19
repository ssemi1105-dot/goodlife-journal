import test from 'node:test';
import assert from 'node:assert/strict';
import { speechRecognitionError } from '../src/hooks/useJapaneseSpeech.js';

test('speech errors distinguish browser causes without claiming a diagnosis for unknown failures', () => {
  const cases = {
    'not-allowed': /권한이 거부/,
    'service-not-allowed': /서비스 사용을 허용하지/,
    'language-not-supported': /일본어를 지원하지/,
    'audio-capture': /소리를 받지 못/,
    network: /연결하지 못/,
    'no-speech': /말소리가 감지되지/,
    aborted: /중단/,
    'start-timeout': /시작 응답이 지연/,
    'start-ended': /시작되기 전에/,
    'result-timeout': /응답이 오래 없어/,
    'stop-timeout': /종료 응답이 지연/,
    'no-result': /인식된 문장 없이/,
    InvalidStateError: /이전 음성 인식/,
    NotAllowedError: /권한이 거부/,
    SecurityError: /보안 설정/,
    unsupported: /음성 입력을 지원하지/,
    'insecure-context': /HTTPS/,
  };
  for (const [code, expected] of Object.entries(cases)) {
    const message = speechRecognitionError(code);
    assert.match(message, expected); assert.ok(message.endsWith(`(${code})`));
  }
  assert.match(speechRecognitionError('language-not-supported', 'ko-KR'), /한국어를 지원하지/);
  assert.match(speechRecognitionError('unexpected'), /원인을 확정할 수 없습니다/);
  for (const code of [null, undefined, '<script>private text</script>', 'a'.repeat(41)]) {
    assert.ok(speechRecognitionError(code).endsWith('(unknown)'));
  }
});
