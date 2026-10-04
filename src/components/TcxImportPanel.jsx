import { useEffect, useRef, useState } from 'react';
import { readTcxFile } from '../services/tcxImportClient';

export default function TcxImportPanel({ onImport, onComplete, onBusyChange, disabled = false }) {
  const input = useRef(null), job = useRef(null), mounted = useRef(true), busy = useRef(false);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; job.current?.cancel(); };
  }, []);
  useEffect(() => { onBusyChange?.(working || pending.length > 0); }, [working, pending.length, onBusyChange]);

  async function saveSummaries(summaries) {
    let saved = 0, duplicates = 0, enriched = 0;
    for (let index = 0; index < summaries.length; index += 1) {
      if (!mounted.current) return;
      setStatus(`운동 저장 중 ${index + 1}/${summaries.length}`);
      try {
        const result = await onImport(summaries[index]);
        if (result.enriched) enriched += 1; else if (result.duplicate) duplicates += 1; else saved += 1;
      } catch {
        if (mounted.current) {
          setPending(summaries.slice(index));
          setError(`저장하지 못했습니다. ${saved}건 저장, ${enriched}건 그래프 추가, ${duplicates}건 중복 제외. 남은 ${summaries.length - index}건은 다시 시도할 수 있습니다.`);
          setStatus('');
        }
        return;
      }
    }
    if (mounted.current) {
      setPending([]); setStatus([saved || (!duplicates && !enriched) ? `${saved}건 저장 완료` : '', enriched ? `${enriched}건 그래프 추가 완료` : '', duplicates ? `이미 등록된 ${duplicates}건 제외` : ''].filter(Boolean).join(' · '));
      onComplete?.();
    }
  }

  async function importFile(event) {
    let file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy.current || disabled) return;
    if (!/\.tcx$/i.test(file.name) || file.size === 0 || file.size > 25 * 1024 * 1024) { setError('25MB 이하의 TCX 파일을 선택해주세요.'); return; }
    busy.current = true; setWorking(true); setError(''); setPending([]); setStatus('파일 분석 중');
    try {
      job.current = readTcxFile(file, percent => { if (mounted.current) setStatus(`파일 분석 중 ${percent}%`); });
      file = null;
      const summaries = await job.current.promise;
      job.current = null;
      if (mounted.current) await saveSummaries(summaries);
    } catch (err) {
      if (mounted.current) { setError(err.name === 'AbortError' ? '가져오기를 취소했습니다.' : err.message); setStatus(''); }
    } finally {
      file = null; job.current = null; busy.current = false;
      if (mounted.current) setWorking(false);
    }
  }

  async function retry() {
    if (busy.current) return;
    busy.current = true; setWorking(true); setError('');
    try { await saveSummaries(pending); }
    finally { busy.current = false; if (mounted.current) setWorking(false); }
  }

  return <section className="tcx-import-panel" aria-label="TCX 운동 가져오기" aria-busy={working}>
    <div className="tcx-import-actions">
      <button type="button" className="secondary-button compact" disabled={disabled || working || !onImport || pending.length > 0} onClick={() => input.current?.click()}><span aria-hidden="true">↥</span> TCX 가져오기</button>
      {pending.length > 0 && <><button type="button" className="secondary-button compact" disabled={working} onClick={retry}>저장 다시 시도</button><button type="button" className="secondary-button compact" disabled={working} onClick={() => { setPending([]); setError(''); setStatus(''); }}>취소</button></>}
    </div>
    <input ref={input} type="file" accept=".tcx,application/vnd.garmin.tcx+xml,application/xml,text/xml" aria-label="TCX 파일 선택" hidden onChange={importFile} />
    {status && <p className="tcx-import-status" role="status">{status}</p>}
    {error && <p className="tcx-import-error" role="alert">{error}</p>}
  </section>;
}
