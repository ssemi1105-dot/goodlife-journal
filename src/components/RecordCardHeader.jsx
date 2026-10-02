import { CATEGORY_MAP } from '../data/categoryDefinitions';
import { getRecordPeriod, getRecordWeather } from '../utils/recordPresentation';

export default function RecordCardHeader({ record, actions, showCategory = true }) {
  const period = getRecordPeriod(record);
  const weather = getRecordWeather(record);
  return (
    <div className="compact-record-header">
      <div className="compact-record-date-row">
        {showCategory && <span className="compact-record-category">{CATEGORY_MAP[record.category_id]?.label || '기록'}</span>}
        <time className="compact-record-date" title={period}>{period}</time>
        {weather && <span className="compact-record-weather" title={weather}>{weather}</span>}
      </div>
      {actions}
    </div>
  );
}
