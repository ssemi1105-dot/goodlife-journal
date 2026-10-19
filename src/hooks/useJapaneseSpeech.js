import { useEffect, useRef, useState } from 'react';

export function useJapaneseSpeech(onTranscript) {
  const [listening, setListening] = useState(false), [error, setError] = useState('');
  const [hasVoice, setHasVoice] = useState(false);
  const recognition = useRef(null), active = useRef(false), consent = useRef(false), transcript = useRef(onTranscript);
  transcript.current = onTranscript;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  function stopRecognition() {
    const instance = recognition.current;
    recognition.current = null;
    if (instance) { instance.onresult = null; instance.onend = null; instance.onerror = null; instance.onstart = null; instance.abort(); }
    if (active.current) setListening(false);
  }
  function stop() { stopRecognition(); synthesis?.cancel(); }
  useEffect(() => {
    active.current = true;
    const voices = () => setHasVoice(!!synthesis?.getVoices().some(voice => /^ja(?:-|$)/i.test(voice.lang)));
    voices(); synthesis?.addEventListener('voiceschanged', voices);
    return () => { active.current = false; stop(); synthesis?.removeEventListener('voiceschanged', voices); };
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
    if (recognition.current) { recognition.current.stop(); return; }
    if (!Recognition) { setError('이 브라우저는 음성 입력을 지원하지 않습니다. 직접 입력해 주세요.'); return; }
    if (!consent.current && !window.confirm('음성 인식 중 브라우저의 외부 서비스에 음성이 전송될 수 있습니다. 마이크를 사용할까요?')) return;
    consent.current = true; synthesis?.cancel(); setError('');
    const instance = new Recognition(); recognition.current = instance;
    instance.lang = language; instance.continuous = false; instance.interimResults = false;
    setListening(true);
    instance.onresult = event => {
      if (active.current && recognition.current === instance) transcript.current([...event.results].map(result => result[0].transcript).join(' '));
    };
    instance.onend = () => { if (active.current && recognition.current === instance) { recognition.current = null; setListening(false); } };
    instance.onerror = event => {
      if (active.current && recognition.current === instance) setError(event.error === 'not-allowed' ? '마이크 사용 권한을 허용해 주세요.' : '음성을 인식하지 못했습니다. 다시 말하거나 직접 입력해 주세요.');
    };
    try { instance.start(); } catch { stopRecognition(); setError('음성 입력을 시작하지 못했습니다.'); }
  }
  return { listening, error, clearError: () => setError(''), supported: !!Recognition, hasVoice, start, speak, stop };
}
