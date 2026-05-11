import { useEffect, useRef, useState } from 'react';
import { calcLineItemAmount, formatMoney } from '../../utils/recordUtils';
import StarRating from './StarRating';

function makeClientId(prefix, index) {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
}

function makeEmptyItem(field, index = 0) {
  const item = {
    _clientId: makeClientId(field.id, index),
    name: '',
    unitPrice: '',
    quantity: field.quantityMode ? '1' : '',
    amount: '',
    rating: 0,
  };
  if (field.discountMode) item.discountAmount = '';
  return item;
}

function normalizeItems(field, value) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.map((item, index) => {
    const next = {
      _clientId: item._clientId || makeClientId(field.id, index),
      name: item.name || '',
      unitPrice: item.unitPrice ?? item.price ?? item.amount ?? '',
      quantity: item.quantity || (field.quantityMode ? '1' : ''),
      discountAmount: item.discountAmount ?? '',
      amount: item.amount ?? item.price ?? '',
      rating: item.rating || 0,
    };
    if (field.quantityMode) next.amount = String(calcLineItemAmount(next) || '');
    return next;
  });
  return normalized.length > 0 ? normalized : [makeEmptyItem(field, 0)];
}

function LineItemRow({ field, item, onDraft, onRemove, onRating }) {
  const rowAmount = calcLineItemAmount(item);

  return (
    <div className={field.itemRating ? 'line-item-row has-rating' : 'line-item-row'}>
      <div className={field.quantityMode ? `line-item-main quantity-line-item${field.discountMode ? ' has-discount' : ''}` : 'line-item-main'}>
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

        {field.quantityMode ? (
          <>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              defaultValue={item.unitPrice || ''}
              onChange={(event) => onDraft(item._clientId, 'unitPrice', event.currentTarget.value)}
              autoComplete="off"
              placeholder={field.unitPriceLabel || '단가'}
            />
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="done"
              defaultValue={item.quantity || '1'}
              onChange={(event) => onDraft(item._clientId, 'quantity', event.currentTarget.value)}
              autoComplete="off"
              placeholder={field.quantityLabel || '수량'}
            />
            {field.discountMode && (
              <input
                type="number"
                inputMode="numeric"
                enterKeyHint="next"
                defaultValue={item.discountAmount || ''}
                onChange={(event) => onDraft(item._clientId, 'discountAmount', event.currentTarget.value)}
                autoComplete="off"
                placeholder={field.discountLabel || '할인'}
              />
            )}
            <output className="line-item-amount">{rowAmount > 0 ? formatMoney(rowAmount) : '총액'}</output>
          </>
        ) : (
          <input
            type="number"
            inputMode="numeric"
            enterKeyHint="done"
            defaultValue={item.amount || ''}
            onChange={(event) => onDraft(item._clientId, 'amount', event.currentTarget.value)}
            autoComplete="off"
            placeholder={field.amountLabel || '금액'}
          />
        )}

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
  const total = totalTick >= 0 ? itemsRef.current.reduce((sum, item) => sum + calcLineItemAmount(item), 0) : 0;

  useEffect(() => {
    const nextItems = normalizeItems(field, value);
    itemsRef.current = nextItems;
    setItems(nextItems);
    setTotalTick((tick) => tick + 1);
  }, [field.id, field.quantityMode]);

  function publishDraft(nextItems) {
    itemsRef.current = nextItems;
    onDraftChange?.(nextItems);
    setTotalTick((tick) => tick + 1);
  }

  function draft(clientId, key, nextValue) {
    publishDraft(itemsRef.current.map((item) => {
      if (item._clientId !== clientId) return item;
      const next = { ...item, [key]: nextValue };
      if (field.quantityMode) next.amount = String(calcLineItemAmount(next) || '');
      return next;
    }));
  }

  function commit(nextItems) {
    publishDraft(nextItems);
    setItems(nextItems);
    onChange(nextItems);
  }

  function add() {
    commit([...itemsRef.current, makeEmptyItem(field, itemsRef.current.length)]);
  }

  function remove(clientId) {
    const nextItems = itemsRef.current.filter((item) => item._clientId !== clientId);
    commit(nextItems.length > 0 ? nextItems : [makeEmptyItem(field, 0)]);
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
