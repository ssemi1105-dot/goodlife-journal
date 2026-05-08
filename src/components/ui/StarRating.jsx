import { toNumber } from '../../utils/recordUtils';

export default function StarRating({ value, onChange, compact = false }) {
  const score = toNumber(value);

  function pick(event, star) {
    const rect = event.currentTarget.getBoundingClientRect();
    const isHalf = event.clientX - rect.left <= rect.width / 2;
    onChange(star - (isHalf ? 0.5 : 0));
  }

  return (
    <div className={compact ? 'star-rating compact-stars' : 'star-rating'}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, score - (star - 1))) * 100;
        return (
          <button type="button" key={star} onPointerDown={(event) => pick(event, star)} aria-label={`${star}점`}>
            <span className="star-empty">★</span>
            <span className="star-fill" style={{ width: `${fill}%` }}>
              <span>★</span>
            </span>
          </button>
        );
      })}
      <strong>{score.toFixed(1)}</strong>
    </div>
  );
}
