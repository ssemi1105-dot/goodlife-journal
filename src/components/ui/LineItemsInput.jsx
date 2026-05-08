import { useEffect, useRef, useState } from 'react';
import { formatMoney, toNumber } from '../../utils/recordUtils';
import StarRating from './StarRating';

function makeClientId(prefix, index) {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
}

function normalizeItems(field, value) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.map((item, index) => ({
    _clientId: item._clientId || makeClientId(field.id, index),
    name: item.name || '',
    amount: item.amount ?? item.price ?? '',
    rating: item.rating || 0,
    quantity: item.quantity || '',
  }));
  return normalized.length > 0 ? normalized : [{ _clientId: makeClientId(field.id, 0), name: '', amount: '', rating: 0, quantity: '' }];
}

function LineItemRow({ field, item, onDraft, onRemove, onRating }) {
  return (
    <div className={field.itemRating ? 'line-item-row has-rating' : 'line-item-row'}>
      <div className="line-item-main">
        <input
          type="text"
          inputMode="text"
          enterKeyHint="next"
          defaultValue={item.name || ''}
          onChange={(event) => onDraft(item._clientId, 'name', event.currentTarget.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          placeholder={field.nameLabel || '항목명'}
        />
        <input
          type="number"
          inputMode="numeric"
          enterKeyHint="done"
          defaultValue={item.amount || ''}
          onChange={(event) => onDraft(item._clientId, 'amount', event.currentTarget.value)}
          autoComplete="off"
          placeholder={field.amountLabel || '가격'}
        />
        <button type="button" className="icon-button small-icon" onClick={() => onRemove(item._clientId)}>×</button>
      </div>
      {field.itemRating && (
        <div className="line-item-rating">
          <span>항목 평점</span>
          <StarRating compact value={item.rating || 0} onChange={(rating) => onRating(item._clientId, rating)} />
        </div>
      )}
    </div>
  );
}

export default function LineItemsInput({ field, value, onChange, onDraftChange }) {
  const [items, setItems] = useState(() => normalizeItems(field, value));
  const [totalTick, setTotalTick] = useState(0);
  const itemsRef = useRef(items);
  const total = totalTick >= 0 ? itemsRef.current.reduce((sum, item) => sum + toNumber(item.amount), 0) : 0;

  useEffect(() => {
    const nextItems = normalizeItems(field, value);
    itemsRef.current = nextItems;
    setItems(nextItems);
    setTotalTick((tick) => tick + 1);
  }, [field.id]);

  function publishDraft(nextItems) {
    itemsRef.current = nextItems;
    onDraftChange?.(nextItems);
  }

  function draft(clientId, key, nextValue) {
    publishDraft(itemsRef.current.map((item) => (item._clientId === clientId ? { ...item, [key]: nextValue } : item)));
  }

  function commit(nextItems) {
    publishDraft(nextItems);
    setItems(nextItems);
    onChange(nextItems);
    setTotalTick((tick) => tick + 1);
  }

  function add() {
    commit([...itemsRef.current, { _clientId: makeClientId(field.id, itemsRef.current.length), name: '', amount: '', rating: 0, quantity: '' }]);
  }

  function remove(clientId) {
    const nextItems = itemsRef.current.filter((item) => item._clientId !== clientId);
    commit(nextItems.length > 0 ? nextItems : [{ _clientId: makeClientId(field.id, 0), name: '', amount: '', rating: 0, quantity: '' }]);
  }

  function rate(clientId, rating) {
    commit(itemsRef.current.map((item) => (item._clientId === clientId ? { ...item, rating } : item)));
  }

  return (
    <div className="line-items">
      {items.map((item) => (
        <LineItemRow key={item._clientId} field={field} item={item} onDraft={draft} onRemove={remove} onRating={rate} />
      ))}
      <button type="button" className="secondary-button add-line-button" onClick={add}>
        {field.addLabel || '항목 추가'}
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
