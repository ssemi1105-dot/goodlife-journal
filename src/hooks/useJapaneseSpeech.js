import { useEffect, useRef, useState } from 'react';

export function speechRecognitionError(code, language = 'ja-JP') {
  const label = language === 'ko-KR' ? '한국어' : '일본어';
  const messages = {
    'not-allowed': '마이크 또는 음성 인식 권한이 거부되었습니다. 이 사이트의 마이크 권한을 확인해 주세요.',
    'service-not-allowed': '브라우저가 음성 인식 서비스 사용을 허용하지 않았습니다. 아이폰은 Safari에서 직접 열고 Siri 및 기기 제한 설정을 확인해 주세요.',
    'language-not-supported': `현재 브라우저의 음성 인식 서비스에서 ${label}를 지원하지 않습니다. Safari와 iOS 업데이트를 확인하거나 직접 입력해 주세요.`,
    'audio-capture': '마이크에서 소리를 받지 못했습니다. 통화나 다른 녹음 앱을 종료하고 다시 시도해 주세요.',
    network: '음성 인식 서비스와 연결하지 못했습니다. Wi-Fi 또는 모바일 데이터 연결을 확인해 주세요.',
    'no-speech': '말소리가 감지되지 않았습니다. 말하기가 시작된 뒤 마이크 가까이에서 다시 말해 주세요.',
    aborted: '브라우저에서 음성 인식이 중단되었습니다. 화면을 켠 상태로 다시 말하기를 눌러 주세요.',
    'start-timeout': '마이크 시작 응답이 지연되었습니다. 권한 요청을 확인하고 다시 시도해 주세요. 정확한 실패 원인은 브라우저가 제공하지 않았습니다.',
    'start-ended': '마이크가 시작되기 전에 인식이 종료되었습니다. 다시 말하기를 눌러 주세요. 정확한 실패 원인은 브라우저가 제공하지 않았습니다.',
    'result-timeout': '음성 인식 응답이 오래 없어 중지했습니다. 연결 상태를 확인하고 짧은 문장으로 다시 말해 주세요.',
    'stop-timeout': '음성 인식 종료 응답이 지연되어 마이크를 해제했습니다. 다시 말하기를 눌러 주세요.',
    'no-result': '인식된 문장 없이 종료되었습니다. 말하기 시작 후 짧은 문장으로 다시 시도해 주세요.',
    'insecure-context': '음성 입력은 보안 연결이 필요합니다. HTTPS로 시작하는 Goodlife 주소에서 열어 주세요.',
    unsupported: '이 브라우저는 음성 입력을 지원하지 않습니다. Safari에서 직접 열거나 직접 입력해 주세요.',
    InvalidStateError: '이전 음성 인식이 아직 종료되지 않았습니다. 잠시 후 다시 말하기를 눌러 주세요.',
    NotAllowedError: '마이크 또는 음성 인식 권한이 거부되었습니다. 이 사이트의 마이크 권한을 확인해 주세요.',
    SecurityError: '브라우저 보안 설정으로 음성 입력이 차단되었습니다. HTTPS 주소와 사이트 권한을 확인해 주세요.',
    NotSupportedError: `${label} 음성 인식을 시작할 수 없습니다. 브라우저 업데이트를 확인하거나 직접 입력해 주세요.`,
  };
  const safeCode = typeof code === 'string' && /^[a-zA-Z-]{1,40}$/.test(code) ? code : 'unknown';
  return `${messages[safeCode] || '음성 인식을 완료하지 못했습니다. 다시 시도해 주세요. 이 오류만으로 원인을 확정할 수 없습니다.'} (${safeCode})`;
}

export function useJapaneseSpeech(onTranscript) {
  const [state, setState] = useState('idle'), [error, setError] = useState('');
  const [hasVoice, setHasVoice] = useState(false);
  const recognition = useRef(null), active = useRef(false), consent = useRef(false), transcript = useRef(onTranscript);
  transcript.current = onTranscript;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  function release(session = recognition.current) {
    if (!session || recognition.current !== session) return;
    recognition.current = null;
    clearTimeout(session.timer);
    const { instance } = session;
    instance.onresult = null; instance.onend = null; instance.onerror = null; instance.onstart = null;
    try { instance.abort(); } catch { /* Already-ended recognizers may reject abort on some browsers. */ }
    if (active.current) setState('idle');
  }
  function stopPlayback() {
    if (synthesis?.speaking || synthesis?.pending) synthesis.cancel();
  }
  function stop() { release(); stopPlayback(); }
  useEffect(() => {
    active.current = true;
    const voices = () => setHasVoice(!!synthesis?.getVoices().some(voice => /^ja(?:-|$)/i.test(voice.lang)));
    const onVisibility = () => { if (document.hidden) stop(); };
    voices(); synthesis?.addEventListener('voiceschanged', voices);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', stop);
    return () => {
      active.current = false; stop(); synthesis?.removeEventListener('voiceschanged', voices);
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', stop);
    };
  }, []);
  function speak(text, rate = .8) {
    stop(); setError('');
    const voice = synthesis?.getVoices().find(item => /^ja(?:-|$)/i.test(item.lang));
    if (!voice) { setError('이 기기에서 일본어 음성을 찾지 못했습니다. 기기의 음성 설정을 확인해 주세요.'); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP'; utterance.voice = voice; utterance.rate = rate;
    utterance.onerror = event => { if (active.current && !['canceled', 'interrupted'].includes(event.error)) setError('음성을 재생하지 못했습니다.'); };
    synthesis.speak(utterance);
  }
  function start(language = 'ja-JP') {
    const current = recognition.current;
    if (current) {
      if (current.phase === 'starting') { release(current); return; }
      if (current.phase === 'stopping') return;
      current.phase = 'stopping'; setState('stopping');
      clearTimeout(current.timer);
      current.timer = setTimeout(() => {
        if (recognition.current !== current) return;
        release(current); setError(speechRecognitionError('stop-timeout', current.language));
      }, 4000);
      try { current.instance.stop(); } catch (err) { release(current); setError(speechRecognitionError(err.name, current.language)); }
      return;
    }
    if (!window.isSecureContext) { setError(speechRecognitionError('insecure-context', language)); return; }
    if (!Recognition) { setError(speechRecognitionError('unsupported', language)); return; }
    if (!consent.current && !window.confirm('음성 인식 중 브라우저의 외부 서비스에 음성이 전송될 수 있습니다. 마이크를 사용할까요?')) return;
    consent.current = true; stopPlayback(); setError('');
    let instance;
    try { instance = new Recognition(); } catch (err) { setError(speechRecognitionError(err.name, language)); return; }
    const session = { instance, phase: 'starting', language, timer: null, results: new Set() };
    recognition.current = session; setState('starting');
    const isCurrent = () => active.current && recognition.current === session;
    const fail = code => { if (isCurrent()) { release(session); setError(speechRecognitionError(code, language)); } };
    instance.onstart = () => {
      if (!isCurrent() || session.phase !== 'starting') return;
      clearTimeout(session.timer); session.phase = 'listening'; setState('listening');
      session.timer = setTimeout(() => fail('result-timeout'), 60000);
    };
    instance.onresult = event => {
      if (!isCurrent()) return;
      const parts = [];
      for (let index = event.resultIndex || 0; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal === false || session.results.has(index) || !result[0]?.transcript?.trim()) continue;
        session.results.add(index); parts.push(result[0].transcript);
      }
      if (parts.length) transcript.current(parts.join(' '));
    };
    instance.onend = () => {
      if (!isCurrent()) return;
      const code = session.phase === 'starting' ? 'start-ended' : !session.results.size ? 'no-result' : null;
      release(session);
      if (code) setError(speechRecognitionError(code, language));
    };
    instance.onerror = event => fail(event.error);
    session.timer = setTimeout(() => fail('start-timeout'), 12000);
    // Keep start synchronous with the user's tap for Safari; do not await a permission preflight.
    try {
      instance.lang = language; instance.continuous = false; instance.interimResults = false;
      instance.maxAlternatives = 1; instance.start();
    } catch (err) { fail(err.name); }
  }
  return {
    listening: state === 'listening', starting: state === 'starting', stopping: state === 'stopping', busy: state !== 'idle',
    error, clearError: () => setError(''), supported: !!Recognition, hasVoice, start, speak, stop,
  };
}
