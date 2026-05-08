import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatMoney, toNumber } from '../utils/recordUtils';

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function makeLineItem(fieldId, item = {}, index = 0) {
  return {
    _clientId: item._clientId || `line-${fieldId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    ...item,
  };
}

function ChoiceGroup({ field, value, onChange, multiple = false, mood = false }) {
  const selected = multiple ? normalizeArray(value) : [value].filter(Boolean);

  function toggle(option) {
    if (!multiple) {
      onChange(value === option ? '' : option);
      return;
    }

    onChange(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    );
  }

  return (
    <div className={mood ? 'mood-choice-grid' : 'choice-grid'}>
      {field.options.map((option) => (
        <button
          type="button"
          key={option}
          className={selected.includes(option) ? 'is-selected' : ''}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function StarRating({ value, onChange, compact = false }) {
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

function LineItemRow({ field, item, onUpdate, onRemove, onRatingChange }) {
  return (
    <div className={field.itemRating ? 'line-item-row has-rating' : 'line-item-row'}>
      <div className="line-item-main">
        <input
          type="text"
          inputMode="text"
          enterKeyHint="next"
          defaultValue={item.name || ''}
          onChange={(event) => onUpdate(item._clientId, 'name', event.currentTarget.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          placeholder={field.nameLabel || '항목'}
        />
        <input
          type="number"
          inputMode="numeric"
          enterKeyHint="done"
          defaultValue={item.amount || ''}
          onChange={(event) => onUpdate(item._clientId, 'amount', event.currentTarget.value)}
          autoComplete="off"
          placeholder={field.amountLabel || '금액'}
        />
        <button type="button" className="icon-button small-icon" onClick={() => onRemove(item._clientId)}>×</button>
      </div>
      {field.itemRating && (
        <div className="line-item-rating">
          <span>항목 평점</span>
          <StarRating compact value={item.rating || 0} onChange={(nextRating) => onRatingChange(item._clientId, nextRating)} />
        </div>
      )}
    </div>
  );
}

function LineItems({ field, value, onChange, onDraftChange }) {
  const [items, setItems] = useState(() => normalizeArray(value).map((item, index) => ({
    _clientId: item._clientId || `line-${field.id}-${Date.now()}-${index}`,
    ...item,
  })));
  const [totalTick, setTotalTick] = useState(0);
  const itemsRef = useRef(items);
  const total = totalTick >= 0
    ? itemsRef.current.reduce((sum, item) => sum + toNumber(item.amount), 0)
    : 0;

  useEffect(() => {
    const nextItems = normalizeArray(value).map((item, index) => makeLineItem(field.id, item, index));
    itemsRef.current = nextItems;
    setItems(nextItems);
    setTotalTick((tick) => tick + 1);
  }, [field.id]);

  function publishDraft(nextItems) {
    itemsRef.current = nextItems;
    onDraftChange?.(nextItems);
  }

  function update(clientId, key, nextValue) {
    const nextItems = itemsRef.current.map((item) => (item._clientId === clientId ? { ...item, [key]: nextValue } : item));
    publishDraft(nextItems);
  }

  function remove(clientId) {
    const nextItems = itemsRef.current.filter((item) => item._clientId !== clientId);
    publishDraft(nextItems);
    setItems(nextItems);
    onChange(nextItems);
    setTotalTick((tick) => tick + 1);
  }

  function add() {
    const nextItems = [...itemsRef.current, makeLineItem(field.id, { name: '', amount: '' }, itemsRef.current.length)];
    publishDraft(nextItems);
    setItems(nextItems);
    onChange(nextItems);
    setTotalTick((tick) => tick + 1);
  }

  function changeRating(clientId, nextRating) {
    const nextItems = itemsRef.current.map((item) => (item._clientId === clientId ? { ...item, rating: nextRating } : item));
    publishDraft(nextItems);
    setItems(nextItems);
    onChange(nextItems);
    setTotalTick((tick) => tick + 1);
  }

  return (
    <div className="line-items">
      {items.map((item) => (
        <LineItemRow
          key={item._clientId}
          field={field}
          item={item}
          onUpdate={update}
          onRemove={remove}
          onRatingChange={changeRating}
        />
      ))}
      <button type="button" className="secondary-button add-line-button" onClick={add}>
        항목 추가
      </button>
      {total > 0 && (
        <div className="line-total">
          <span>합계</span>
          <strong>{formatMoney(total)}</strong>
        </div>
      )}
    </div>
  );
}

export default function FieldInput({ field, value, onChange, onDraftChange }) {
  const [tagText, setTagText] = useState('');
  const [tmdbQuery, setTmdbQuery] = useState(typeof value === 'object' ? value?.title || '' : value || '');
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

  if (field.type === 'choice') {
    return <ChoiceGroup field={field} value={value} onChange={onChange} />;
  }

  if (field.type === 'multiChoice') {
    return <ChoiceGroup field={field} value={value} onChange={onChange} multiple />;
  }

  if (field.type === 'moodChoice') {
    return <ChoiceGroup field={field} value={value} onChange={onChange} mood />;
  }

  if (field.type === 'boolean') {
    return (
      <button type="button" className={`toggle-button ${value ? 'is-on' : ''}`} onClick={() => onChange(!value)}>
        <span />
        {value ? '예' : '아니오'}
      </button>
    );
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
          <input value={tagText} onChange={(event) => setTagText(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTag();
            }
          }} placeholder={`${field.label} 추가`} />
          <button type="button" onClick={addTag}>추가</button>
        </div>
      </div>
    );
  }

  if (field.type === 'lineItems') {
    return <LineItems field={field} value={value} onChange={onChange} onDraftChange={onDraftChange} />;
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
          <button type="button" onClick={searchTmdb} disabled={searching}>{searching ? '검색 중' : '다시'}</button>
        </div>
        {value?.poster && (
          <div className="selected-media">
            <img src={value.poster} alt="" />
            <div>
              <strong>{value.title}</strong>
              <span>{value.year || value.mediaType}</span>
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
                {item.poster && <img src={item.poster} alt="" />}
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
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}
