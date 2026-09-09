import { APP_VERSION } from '../lib/appVersion';
import { CATEGORY_MAP } from '../data/categoryDefinitions';
import { getRecordTitle, toNumber } from '../utils/recordUtils';

const RUNTIME_ONLY_KEYS = new Set(['signedUrl', 'previewUrl', 'file']);

function cleanExportValue(value) {
  if (Array.isArray(value)) return value.map(cleanExportValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !RUNTIME_ONLY_KEYS.has(key))
      .map(([key, item]) => [key, cleanExportValue(item)]),
  );
}

function toExportRecord(record) {
  return {
    id: record.id,
    category_id: record.category_id,
    title: record.title || getRecordTitle(record.category_id, record.data),
    occurred_on: record.occurred_on,
    amount: toNumber(record.amount),
    income_amount: toNumber(record.income_amount),
    rating: record.rating ?? null,
    data: cleanExportValue(record.data || {}),
    weather_code: record.weather_code ?? null,
    weather_label: record.weather_label ?? null,
    temperature_max: record.temperature_max ?? null,
    temperature_min: record.temperature_min ?? null,
    weather_location: record.weather_location ?? null,
    weather_latitude: record.weather_latitude ?? null,
    weather_longitude: record.weather_longitude ?? null,
    weather_fetched_at: record.weather_fetched_at ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function todayFileStamp() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function downloadBlob(content, type, fileName) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '""';
  let text = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function displayMoney(value) {
  return `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`;
}

export default function DataExportPanel({ records = [], profile }) {
  const exportRecords = records.map(toExportRecord);
  const categoryCount = new Set(records.map((record) => record.category_id)).size;

  function downloadJson() {
    const payload = {
      exportType: 'goodlife-journal',
      schemaVersion: 1,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: { displayName: profile?.display_name || '사용자' },
      recordCount: exportRecords.length,
      records: exportRecords,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
      `goodlife-backup-${todayFileStamp()}.json`,
    );
  }

  function downloadCsv() {
    const headers = ['날짜', '카테고리', '제목', '지출금액', '수입금액', '평점', '메모', '날씨', '최저기온', '최고기온', '상세데이터'];
    const rows = exportRecords.map((record) => [
      record.occurred_on,
      CATEGORY_MAP[record.category_id]?.label || record.category_id,
      record.title,
      record.amount,
      record.income_amount,
      record.rating ?? '',
      record.data?.memo || '',
      record.weather_label || '',
      record.temperature_min ?? '',
      record.temperature_max ?? '',
      JSON.stringify(record.data),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    downloadBlob(
      `\ufeff${csv}`,
      'text/csv;charset=utf-8',
      `goodlife-records-${todayFileStamp()}.csv`,
    );
  }

  function printRecords() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.alert('인쇄 화면을 열지 못했습니다. 브라우저의 팝업 차단을 확인해 주세요.');
      return;
    }
    printWindow.opener = null;

    const expenseTotal = exportRecords.reduce((sum, record) => sum + toNumber(record.amount), 0);
    const incomeTotal = exportRecords.reduce((sum, record) => sum + toNumber(record.income_amount), 0);
    const tableRows = exportRecords.map((record) => `
      <tr>
        <td>${escapeHtml(record.occurred_on)}</td>
        <td>${escapeHtml(CATEGORY_MAP[record.category_id]?.label || record.category_id)}</td>
        <td>${escapeHtml(record.title)}</td>
        <td class="number">${escapeHtml(displayMoney(record.amount))}</td>
        <td class="number">${escapeHtml(displayMoney(record.income_amount))}</td>
        <td>${escapeHtml(record.rating ?? '')}</td>
        <td>${escapeHtml(record.data?.memo || '')}</td>
      </tr>
    `).join('');

    printWindow.document.write(`<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>Goodlife Journal 내 기록</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #26231f; font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif; font-size: 11px; }
            header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; border-bottom: 2px solid #397356; padding-bottom: 10px; }
            h1 { margin: 0 0 4px; font-size: 22px; }
            p { margin: 0; color: #666; }
            .summary { display: flex; gap: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 7px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
            th { background: #f2f5ef; color: #315441; white-space: nowrap; }
            .number { text-align: right; white-space: nowrap; }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>Goodlife Journal</h1>
              <p>${escapeHtml(profile?.display_name || '사용자')}님의 기록 · ${escapeHtml(todayFileStamp())} 출력</p>
            </div>
            <div class="summary">
              <span>${exportRecords.length}개 기록</span>
              <span>지출 ${escapeHtml(displayMoney(expenseTotal))}</span>
              <span>수입 ${escapeHtml(displayMoney(incomeTotal))}</span>
            </div>
          </header>
          <table>
            <thead><tr><th>날짜</th><th>카테고리</th><th>제목</th><th>지출</th><th>수입</th><th>평점</th><th>메모</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <script>window.addEventListener('load', () => window.setTimeout(() => window.print(), 150));<\/script>
        </body>
      </html>`);
    printWindow.document.close();
  }

  const actions = [
    { format: 'JSON', title: '전체 백업 파일', description: '기록과 상세 필드를 보존합니다.', onClick: downloadJson },
    { format: 'CSV', title: '표 형식 다운로드', description: '엑셀에서 열어 정리할 수 있습니다.', onClick: downloadCsv },
    { format: 'PDF', title: '인쇄 또는 PDF 저장', description: '날짜순 기록표를 출력합니다.', onClick: printRecords },
  ];

  return (
    <div className="data-export-panel">
      <div className="data-export-overview">
        <div>
          <strong>{records.length.toLocaleString('ko-KR')}개 기록</strong>
          <span>{categoryCount}개 카테고리</span>
        </div>
        <small>현재 로그인한 계정의 데이터만 사용합니다.</small>
      </div>

      <div className="data-export-actions">
        {actions.map((action) => (
          <button type="button" className="data-export-action" key={action.format} onClick={action.onClick} disabled={records.length === 0}>
            <span className="data-export-format" aria-hidden="true">{action.format}</span>
            <span className="data-export-copy">
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </span>
            <span className="row-chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      <p className="data-export-note">
        파일은 이 기기에서 생성되며 외부 서버로 전송되지 않습니다. 사진 원본은 포함하지 않고 저장 경로 정보만 백업합니다.
      </p>
    </div>
  );
}
