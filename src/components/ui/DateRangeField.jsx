function shortDate(value, fallback) {
  if (!value) return fallback;
  const [, month, day] = value.split('-');
  return `${month}.${day}`;
}

export default function DateRangeField({ value = {}, onChange }) {
  const start = value.start || '';
  const end = value.end || '';

  function update(key, nextValue) {
    const next = { ...value, [key]: nextValue };
    if (key === 'start' && next.end && nextValue > next.end) next.end = nextValue;
    if (key === 'end' && next.start && nextValue < next.start) next.start = nextValue;
    onChange(next);
  }

  return (
    <div className="date-range-field">
      <label>
        <span>시작 {shortDate(start, '')}</span>
        <input type="date" value={start} onChange={(event) => update('start', event.target.value)} />
      </label>
      <label>
        <span>종료 {shortDate(end, '')}</span>
        <input type="date" value={end} onChange={(event) => update('end', event.target.value)} />
      </label>
    </div>
  );
}
