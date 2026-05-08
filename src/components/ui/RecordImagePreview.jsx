export function getRecordImageUrl(record) {
  const data = record?.data || {};
  if (record?.photoUrl) return record.photoUrl;
  if (Array.isArray(record?.photoUrls) && record.photoUrls[0]) return record.photoUrls[0];
  if (Array.isArray(data.photos) && (data.photos[0]?.signedUrl || data.photos[0]?.url)) return data.photos[0].signedUrl || data.photos[0].url;
  return data.tmdbPosterUrl || data.title?.posterUrl || data.title?.poster || '';
}

export default function RecordImagePreview({ record, large = false }) {
  const imageUrl = getRecordImageUrl(record);
  if (!imageUrl) return null;
  return <img className={large ? 'detail-photo' : 'record-photo'} src={imageUrl} alt="" />;
}
