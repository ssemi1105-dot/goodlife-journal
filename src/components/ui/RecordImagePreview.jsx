import { useState } from 'react';

export function getRecordImageUrl(record) {
  const data = record?.data || {};
  if (record?.photoUrl) return record.photoUrl;
  if (Array.isArray(record?.photoUrls) && record.photoUrls[0]) return record.photoUrls[0];
  if (Array.isArray(data.photos) && (data.photos[0]?.signedUrl || data.photos[0]?.url)) return data.photos[0].signedUrl || data.photos[0].url;
  const path = data.tmdbPosterPath || data.title?.posterPath;
  return data.tmdbPosterUrl || data.title?.posterUrl || data.title?.poster || (typeof path === 'string' && path.startsWith('/') ? `https://image.tmdb.org/t/p/w342${path}` : '');
}

export default function RecordImagePreview({ record, large = false, url }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const imageUrl = url || getRecordImageUrl(record);
  if (!imageUrl) return null;
  const className = `${large ? 'detail-photo' : 'record-photo'}${record.category_id === 'video' ? ' is-poster' : ''}`;
  if (failedUrl === imageUrl) return <span className={`${className} record-image-fallback`} role="img" aria-label="이미지를 불러올 수 없음">사진</span>;
  return <img className={className} src={imageUrl} alt={record.category_id === 'video' ? '작품 포스터' : '기록 사진'} loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} />;
}
