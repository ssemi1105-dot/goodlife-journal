import { toNumber } from '../../utils/recordUtils';

export default function RatingPreview({ value }) {
  if (value === null || value === undefined || value === '') return null;
  const score = Math.max(0, Math.min(5, toNumber(value)));

  return (
    <span className="rating-preview" role="img" aria-label={`평점 ${score.toFixed(1)} / 5점`} title={`평점 ${score.toFixed(1)} / 5점`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span className="rating-preview-star" key={star} aria-hidden="true">
          <span className="rating-preview-empty">★</span>
          <span className="rating-preview-fill" style={{ width: `${Math.max(0, Math.min(1, score - star + 1)) * 100}%` }}>
            <span>★</span>
          </span>
        </span>
      ))}
    </span>
  );
}
