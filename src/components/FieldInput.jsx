import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ChipGroup from './ui/ChipGroup';
import CompactToggle from './ui/CompactToggle';
import DateRangeField from './ui/DateRangeField';
import LineItemsInput from './ui/LineItemsInput';
import PhotoUploader from './ui/PhotoUploader';
import StarRating from './ui/StarRating';

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function FieldInput({ field, value, onChange, onDraftChange }) {
  const [tagText, setTagText] = useState('');
  const [tmdbQuery, setTmdbQuery] = useState(typeof value === 'object' ? value?.title || value?.tmdbTitle || '' : value || '');
  const [tmdbResults, setTmdbResults] = useState([]);
  const [tmdbError, setTmdbError] = useState('');
  const [searching, setSearching] = useState(false);
  const tmdbCacheRef = useRef(new Map());
  const tmdbRequestRef = useRef(0);

  const photoPreview = useMemo(() => {
    if (value instanceof File) return URL.createObjectURL(value);
    if (typeof value === 'string') return value;
    return '';
  }, [value]);

  function addTag() {
    const next = tagText.trim();
    if (!next) return;
    onChange([...normalizeArray(value), next]);
    setTagText('');
  }

  async function searchTmdb(nextQuery = tmdbQuery) {
    const query = nextQuery.trim();
    if (!query || !supabase) return;
    const cacheKey = query.toLowerCase();
    if (tmdbCacheRef.current.has(cacheKey)) {
      setTmdbResults(tmdbCacheRef.current.get(cacheKey));
      return;
    }

    const requestId = tmdbRequestRef.current + 1;
    tmdbRequestRef.current = requestId;
    setSearching(true);
    setTmdbError('');
    try {
      const { data, error } = await supabase.functions.invoke('tmdb-search', {
        body: { query },
      });
      if (requestId !== tmdbRequestRef.current) return;
      if (error) throw error;
      const results = data?.results || [];
      tmdbCacheRef.current.set(cacheKey, results);
      setTmdbResults(results);
    } catch {
      if (requestId !== tmdbRequestRef.current) return;
      setTmdbResults([]);
      setTmdbError('TMDB 검색 함수를 확인해주세요.');
    } finally {
      if (requestId === tmdbRequestRef.current) setSearching(false);
    }
  }

  useEffect(() => {
    if (field.type !== 'tmdb') return undefined;
    const query = tmdbQuery.trim();
    if (query.length < 2) {
      setTmdbResults([]);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      searchTmdb(query);
    }, 280);

    return () => window.clearTimeout(timer);
  }, [field.type, tmdbQuery]);

  if (field.type === 'textarea') {
    return <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder || ''} rows={3} />;
  }

  if (field.type === 'dateRange') {
    return <DateRangeField value={value || {}} onChange={onChange} />;
  }

  if (field.type === 'select') {
    return (
      <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">선택 안 함</option>
        {field.options.map((option) => (
          <option value={option} key={option}>{option}</option>
        ))}
      </select>
    );
  }

  if (['choice', 'multiChoice', 'moodChoice'].includes(field.type)) {
    return (
      <ChipGroup
        options={field.options}
        value={value}
        onChange={onChange}
        multiple={field.type === 'multiChoice'}
        compact={field.compact !== false}
      />
    );
  }

  if (field.type === 'boolean') {
    return <CompactToggle checked={Boolean(value)} onChange={onChange} label={value ? '예' : '아니오'} />;
  }

  if (field.type === 'rating') {
    return <StarRating value={value} onChange={onChange} />;
  }

  if (field.type === 'tags') {
    return (
      <div className="tag-input">
        <div className="tag-list">
          {normalizeArray(value).map((tag) => (
            <button type="button" key={tag} onClick={() => onChange(normalizeArray(value).filter((item) => item !== tag))}>
              {tag} ×
            </button>
          ))}
        </div>
        <div className="tag-entry">
          <input
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTag();
              }
            }}
            placeholder={`${field.label} 추가`}
          />
          <button type="button" onClick={addTag}>추가</button>
        </div>
      </div>
    );
  }

  if (field.type === 'lineItems') {
    return <LineItemsInput field={field} value={value} onChange={onChange} onDraftChange={onDraftChange} />;
  }

  if (field.type === 'photos') {
    return <PhotoUploader value={value} onChange={onChange} />;
  }

  if (field.type === 'photo') {
    return (
      <div className="photo-input">
        {photoPreview && <img src={photoPreview} alt="" />}
        <input type="file" accept="image/*" onChange={(event) => onChange(event.target.files?.[0] || null)} />
      </div>
    );
  }

  if (field.type === 'tmdb') {
    return (
      <div className="tmdb-input">
        <div className="inline-control">
          <input value={tmdbQuery} onChange={(event) => setTmdbQuery(event.target.value)} placeholder="작품명 검색" />
          <button type="button" onClick={() => searchTmdb()} disabled={searching}>{searching ? '검색 중' : '검색'}</button>
        </div>
        {(value?.posterUrl || value?.poster || value?.tmdbPosterUrl) && (
          <div className="selected-media">
            <img src={value.posterUrl || value.poster || value.tmdbPosterUrl} alt="" />
            <div>
              <strong>{value.title || value.tmdbTitle}</strong>
              <span>{value.year || value.mediaType || value.tmdbMediaType}</span>
              {value.genres?.length > 0 && (
                <div className="genre-pills">
                  {value.genres.map((genre) => <em key={genre}>{genre}</em>)}
                </div>
              )}
            </div>
          </div>
        )}
        {tmdbError && <p className="input-hint error-hint">{tmdbError}</p>}
        {tmdbResults.length > 0 && (
          <div className="tmdb-results">
            {tmdbResults.map((item) => (
              <button
                type="button"
                key={`${item.mediaType}-${item.id}`}
                onClick={() => {
                  onChange(item);
                  setTmdbQuery(item.title);
                  setTmdbResults([]);
                }}
              >
                {item.posterUrl && <img src={item.posterUrl} alt="" />}
                <span>
                  {item.title}
                  <small>{item.year || '연도 미상'} · {item.mediaType === 'movie' ? '영화' : 'TV'}</small>
                  {item.genres?.length > 0 && <small>{item.genres.join(' · ')}</small>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const inputType = field.type === 'money' || field.type === 'number' ? 'number' : field.type === 'duration' ? 'text' : field.type;
  const placeholder = field.placeholder || (field.type === 'duration' ? '예: 1시간 30분' : '');

  return (
    <input
      type={inputType}
      min={field.min}
      max={field.max}
      step={field.step}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      readOnly={Boolean(field.readOnly)}
      aria-readonly={Boolean(field.readOnly)}
    />
  );
}
