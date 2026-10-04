export function readTcxFile(file, onProgress) {
  const worker = new Worker(new URL('../workers/tcx.worker.js', import.meta.url), { type: 'module' });
  let rejectJob, timer, finished = false;
  const dispose = () => { finished = true; clearTimeout(timer); worker.onmessage = null; worker.onerror = null; worker.terminate(); };
  const promise = new Promise((resolve, reject) => {
    rejectJob = reject;
    timer = setTimeout(() => { dispose(); reject(new Error('파일 분석 시간이 초과됐습니다. 작은 파일로 다시 시도해주세요.')); }, 60000);
    worker.onmessage = ({ data }) => {
      if (data.error) { dispose(); reject(new Error(data.error)); }
      else if (data.summaries) { dispose(); resolve(data.summaries); }
      else if (Number.isFinite(data.progress)) onProgress?.(data.progress);
    };
    worker.onerror = () => { dispose(); reject(new Error('TCX 분석을 시작하지 못했습니다. 새로고침 후 다시 시도해주세요.')); };
    try { worker.postMessage(file); }
    catch { dispose(); reject(new Error('파일을 읽지 못했습니다. 다시 선택해주세요.')); }
  });
  return { promise, cancel() { if (!finished) { dispose(); rejectJob(new DOMException('가져오기를 취소했습니다.', 'AbortError')); } } };
}
