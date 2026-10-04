import { createTcxSummaryParser, MAX_TCX_BYTES } from '../utils/tcxParser';

self.onmessage = async event => {
  let file = event.data;
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_TCX_BYTES) {
    self.postMessage({ error: '비어 있지 않은 25MB 이하 TCX 파일을 선택해주세요.' }); self.close(); return;
  }
  let reader;
  try {
    reader = file.stream().getReader();
    const size = file.size;
    file = null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const parser = createTcxSummaryParser();
    let readBytes = 0, reported = -1;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      readBytes += value.byteLength;
      if (readBytes > MAX_TCX_BYTES) throw new Error('25MB 이하 TCX 파일을 선택해주세요.');
      parser.write(decoder.decode(value, { stream: true }));
      const progress = Math.floor(readBytes / size * 100);
      if (progress >= reported + 5) { self.postMessage({ progress }); reported = progress; }
    }
    parser.write(decoder.decode());
    const summaries = await parser.finish();
    self.postMessage({ summaries });
  } catch (error) {
    self.postMessage({ error: error instanceof TypeError ? 'UTF-8 TCX 파일을 읽지 못했습니다. Zepp에서 다시 내보내주세요.' : error.message });
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    file = null;
    self.close();
  }
};
