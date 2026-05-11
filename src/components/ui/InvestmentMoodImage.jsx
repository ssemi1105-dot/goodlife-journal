import { useState } from 'react';

const MOODS = [
  {
    key: 'catastrophe',
    min: -Infinity,
    max: -30,
    emoji: '📉',
    face: '😭',
    label: '대참사',
    range: '-30% 초과 손실',
    className: 'mood-catastrophe',
  },
  {
    key: 'despair',
    min: -30,
    max: -20,
    emoji: '🌧️',
    face: '😢',
    label: '절망',
    range: '-20% ~ -30%',
    className: 'mood-despair',
  },
  {
    key: 'sad',
    min: -20,
    max: -10,
    emoji: '💧',
    face: '😥',
    label: '슬픔',
    range: '-10% ~ -20%',
    className: 'mood-sad',
  },
  {
    key: 'blue',
    min: -10,
    max: 0,
    emoji: '☁️',
    face: '😐',
    label: '우울',
    range: '-10% ~ 0%',
    className: 'mood-blue',
  },
  {
    key: 'calm',
    min: 0,
    max: 10,
    emoji: '😊',
    face: '😊',
    label: '평온',
    range: '0% ~ +9%',
    className: 'mood-calm',
  },
  {
    key: 'happy',
    min: 10,
    max: 30,
    emoji: '✨',
    face: '😄',
    label: '기쁨',
    range: '+10% ~ +30%',
    className: 'mood-happy',
  },
  {
    key: 'party',
    min: 30,
    max: Infinity,
    emoji: '🎉',
    face: '😆',
    label: '광란',
    range: '+30% 초과',
    className: 'mood-party',
  },
];

function getMoodImageSrc(label) {
  return `/investment-moods/${encodeURIComponent(label)}.png`;
}

export function getInvestmentMood(rate = 0) {
  const numericRate = Number(rate);
  const safeRate = Number.isFinite(numericRate) ? numericRate : 0;
  return MOODS.find((mood) => safeRate < mood.max && safeRate >= mood.min) || MOODS[4];
}

export default function InvestmentMoodImage({ rate = 0, compact = false, background = false }) {
  const mood = getInvestmentMood(rate);
  const [imageError, setImageError] = useState(false);
  const imageSrc = getMoodImageSrc(mood.label);

  if (background) {
    return (
      <div className={`investment-mood-backdrop ${mood.className}`} aria-hidden="true">
        {imageError ? (
          <>
            <span className="mood-effect">{mood.emoji}</span>
            <span className="mood-face">{mood.face}</span>
          </>
        ) : (
          <img src={imageSrc} alt="" onError={() => setImageError(true)} />
        )}
      </div>
    );
  }

  return (
    <figure className={`investment-mood-image ${mood.className} ${compact ? 'is-compact' : ''}`}>
      <div className={`investment-mood-art ${imageError ? '' : 'has-file-image'}`} aria-hidden="true">
        {imageError ? (
          <>
            <span className="mood-effect">{mood.emoji}</span>
            <span className="mood-face">{mood.face}</span>
          </>
        ) : (
          <img src={imageSrc} alt="" onError={() => setImageError(true)} />
        )}
      </div>
      {!compact && (
        <figcaption>
          <strong>{mood.label}</strong>
          <span>{mood.range}</span>
        </figcaption>
      )}
    </figure>
  );
}
