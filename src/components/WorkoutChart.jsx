import { useMemo, useState } from 'react';
import { cleanWorkoutChart } from '../utils/workoutChartData';

const SERIES = [
  { label: '심박', unit: 'bpm', color: '#b74858', dash: undefined },
  { label: '고도', unit: 'm', color: '#28734d', dash: '6 3' },
  { label: '속도', unit: 'km/h', color: '#276eae', dash: '2 3' },
];
const number = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
function elapsed(value) {
  const seconds = Math.max(0, Math.round(value));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`;
}

export default function WorkoutChart({ data }) {
  const chart = useMemo(() => cleanWorkoutChart(data), [data]);
  const [enabled, setEnabled] = useState([true, true, true]);
  const [selected, setSelected] = useState(0);
  const series = useMemo(() => SERIES.map((item, index) => {
    const values = chart?.points.map(row => row[index + 1]).filter(value => value !== null) || [];
    const min = values.length ? Math.min(...values) : null, max = values.length ? Math.max(...values) : null;
    const pad = min === max ? Math.max(1, Math.abs(min) * 0.05) : 0;
    return { ...item, min, max, low: min - pad, high: max + pad };
  }), [chart]);

  if (!chart) return <section className="workout-chart is-empty"><h3>운동 흐름</h3><p>시간별 그래프 데이터가 없습니다.</p></section>;

  const duration = Math.max(1, chart.durationSeconds);
  const index = Math.min(selected, chart.points.length - 1);
  const current = chart.points[index];
  const x = time => time / duration * 600;
  const y = (value, item) => 166 - (value - item.low) / (item.high - item.low) * 152;
  function selectTime(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration;
    let nearest = 0;
    chart.points.forEach((row, i) => { if (Math.abs(row[0] - time) < Math.abs(chart.points[nearest][0] - time)) nearest = i; });
    setSelected(nearest);
  }
  function linePath(item, channel) {
    let open = false;
    return chart.points.map(row => {
      if (row[channel + 1] === null) { open = false; return ''; }
      const command = open ? 'L' : 'M'; open = true;
      return `${command}${x(row[0]).toFixed(2)},${y(row[channel + 1], item).toFixed(2)}`;
    }).join(' ');
  }
  return <section className="workout-chart" aria-label="운동 변화 그래프">
    <header><h3>운동 흐름</h3><span>구간 평균 · {chart.intervalSeconds}초 단위</span></header>
    <div className="workout-chart-caption"><span>개별 눈금</span><output>경과 약 {elapsed(current[0])}</output></div>
    <svg className="workout-chart-plot" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="경과시간별 심박, 고도, 속도 변화. 각 항목은 독립된 눈금입니다."
      onPointerDown={event => { selectTime(event); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (event.buttons || event.pointerType === 'mouse') selectTime(event); }}>
      {[14, 90, 166].map(height => <line className="workout-chart-grid" key={height} x1="0" x2="600" y1={height} y2={height} />)}
      {series.map((item, channel) => enabled[channel] && item.min !== null && <g key={item.label} data-series={item.label}>
        <path d={linePath(item, channel)} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} vectorEffect="non-scaling-stroke" />
        {chart.points.map((row, i) => row[channel + 1] !== null && <circle key={i} cx={x(row[0])} cy={y(row[channel + 1], item)} r="2" fill={item.color} />)}
      </g>)}
      <line className="workout-chart-cursor" x1={x(current[0])} x2={x(current[0])} y1="0" y2="180" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="workout-chart-axis"><span>0:00</span><span>{elapsed(duration / 2)}</span><span>{elapsed(chart.durationSeconds)}</span></div>
    <input className="workout-chart-slider" type="range" min="0" max={chart.points.length - 1} value={index} step="1" disabled={chart.points.length === 1}
      aria-label="그래프 시점" aria-valuetext={`경과 ${elapsed(current[0])}`} onChange={event => setSelected(Number(event.target.value))} />
    <div className="workout-chart-legend">
      {series.map((item, channel) => <button type="button" key={item.label} disabled={item.min === null} aria-label={`${item.label} 표시`} aria-pressed={enabled[channel] && item.min !== null}
        className={!enabled[channel] || item.min === null ? 'is-muted' : ''} style={{ '--series-color': item.color }}
        onClick={() => setEnabled(values => values.map((value, i) => i === channel ? !value : value))}>
        <span className="workout-chart-legend-name"><i aria-hidden="true" />{item.label}</span>
        <strong>{current[channel + 1] === null ? '미측정' : number(current[channel + 1])}<small>{current[channel + 1] !== null ? item.unit : ''}</small></strong>
        <span className="workout-chart-range">{item.min === null ? '측정값 없음' : `${number(item.min)} ~ ${number(item.max)} ${item.unit}`}</span>
      </button>)}
    </div>
  </section>;
}
