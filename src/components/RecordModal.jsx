import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_MAP } from '../data/categoryDefinitions';
import FieldInput from './FieldInput';
import { calcDutchPay, calcInvestment, formatMoney, toNumber, todayIso } from '../utils/recordUtils';

function buildInitialForm(category, record) {
  const base = Object.fromEntries(category.fields.map((field) => {
    if (['tags', 'multiChoice', 'lineItems'].includes(field.type)) return [field.id, []];
    if (field.type === 'rating') return [field.id, 0];
    if (field.type === 'boolean') return [field.id, false];
    return [field.id, ''];
  }));
  const data = record?.data || {};
  return {
    ...base,
    ...data,
    date: record?.occurred_on || data.date || todayIso(),
    photo: record?.photoUrl || '',
    photoPath: data.photoPath || null,
  };
}

export default function RecordModal({ categoryId, record, onClose, onSave }) {
  const category = CATEGORY_MAP[categoryId];
  const [form, setForm] = useState(() => buildInitialForm(category, record));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(buildInitialForm(category, record));
  }, [category, record]);

  const dutchPay = categoryId === 'dining' ? calcDutchPay(form) : null;
  const investment = categoryId === 'investment' ? calcInvestment(form) : null;

  const requiredMissing = useMemo(() => {
    return category.fields.find((field) => field.required && !form[field.id]);
  }, [category.fields, form]);

  function setField(fieldId, value) {
    setForm((current) => {
      const next = { ...current, [fieldId]: value };
      if (categoryId === 'delivery' && (fieldId === 'menuItems' || fieldId === 'deliveryFee')) {
        next.totalAmount = String(toNumber(next.menuItems) + toNumber(next.deliveryFee));
      }
      if (categoryId === 'salary' && (fieldId === 'grossAmount' || fieldId === 'tax') && !toNumber(next.netAmount)) {
        next.netAmount = String(Math.max(0, toNumber(next.grossAmount) - toNumber(next.tax)));
      }
      if (categoryId === 'overseasTravel' && ['airfare', 'lodgingCost', 'localExpenses'].includes(fieldId)) {
        next.krwAmount = String(toNumber(next.airfare) + toNumber(next.lodgingCost) + toNumber(next.localExpenses));
      }
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (requiredMissing) {
      setError(`${requiredMissing.label} 항목을 입력해주세요.`);
      return;
    }

    setSaving(true);
    onClose();
    try {
      await onSave(categoryId, form, record);
    } catch (err) {
      window.alert(err.message || '저장에 실패했습니다.');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="record-modal" onSubmit={submit}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">{record ? '기록 수정' : '새 기록'}</p>
            <h2>{category.label}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="field-grid">
          {category.fields.map((field) => {
            if (categoryId === 'salary' && field.id === 'bonusAmount' && !form.bonus) return null;
            return (
              <div className="field" key={field.id}>
                <span>{field.label}{field.required && <b> *</b>}</span>
                <FieldInput field={field} value={form[field.id]} onChange={(value) => setField(field.id, value)} />
              </div>
            );
          })}
        </div>

        {categoryId === 'dining' && toNumber(form.menuItems) > 0 && (
          <aside className="calc-box">
            <span>더치페이 예상</span>
            <strong>{formatMoney(dutchPay)}</strong>
          </aside>
        )}

        {categoryId === 'investment' && investment.buyTotal > 0 && (
          <aside className="calc-box">
            <span>투자 계산</span>
            <strong className={investment.profit >= 0 ? 'profit-plus' : 'profit-minus'}>
              {investment.rate.toFixed(2)}% · {formatMoney(investment.profit)}
            </strong>
          </aside>
        )}

        {error && <p className="form-error">{error}</p>}

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>취소</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? '저장 중' : '저장'}</button>
        </footer>
      </form>
    </div>
  );
}
