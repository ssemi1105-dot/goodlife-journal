import { useEffect, useRef, useState } from 'react';
import { CATEGORY_MAP } from '../data/categoryDefinitions';
import FieldInput from './FieldInput';
import { calcDutchPay, calcInvestment, formatMoney, toNumber, todayIso } from '../utils/recordUtils';

function buildInitialForm(category, record) {
  const base = Object.fromEntries(category.fields.map((field) => {
    if (['tags', 'multiChoice', 'lineItems', 'photos'].includes(field.type)) return [field.id, []];
    if (field.type === 'rating') return [field.id, 0];
    if (field.type === 'boolean') return [field.id, false];
    if (field.type === 'dateRange') return [field.id, { start: '', end: '' }];
    return [field.id, ''];
  }));
  const data = record?.data || {};
  const initial = {
    ...base,
    ...data,
    date: record?.occurred_on || data.date || todayIso(),
    photo: record?.photoUrl || '',
    photoPath: data.photoPath || null,
  };
  category.fields.forEach((field) => {
    if (field.type === 'dateRange') {
      initial[field.id] = {
        start: data[field.startId] || data.startDate || data.date || initial.date || '',
        end: data[field.endId] || data.endDate || '',
      };
    }
  });
  if (category.id === 'hospital') {
    initial.hospitalName = data.hospitalName || data.hospital || '';
    initial.medicalCost = data.medicalCost || data.amount || '';
    initial.insuranceRefund = data.insuranceRefund || '';
    initial.netMedicalCost = data.netMedicalCost || data.amount || '';
  }
  if (category.id === 'investment') {
    initial.symbol = data.symbol || data.ticker || '';
    initial.assetName = data.assetName || '';
    initial.avgBuyPrice = data.avgBuyPrice || data.buyPrice || '';
    initial.quantity = data.quantity || '';
    initial.currentPrice = data.currentPrice || '';
    initial.buyAmount = data.buyAmount || (toNumber(initial.avgBuyPrice) * toNumber(initial.quantity) || '');
    initial.currentAmount = data.currentAmount || (toNumber(initial.currentPrice) * toNumber(initial.quantity) || '');
  }
  if (category.id === 'shopping') {
    initial.productItems = data.productItems?.length ? data.productItems : data.product ? [{ name: data.product, amount: data.amount || '' }] : data.items || [];
  }
  if (category.id === 'fishing') {
    initial.catchCount = data.catchCount || data.count || '';
    initial.targetFish = data.targetFish || data.fishTypes || [];
  }
  return initial;
}

export default function RecordModal({ categoryId, record, onClose, onSave }) {
  const category = CATEGORY_MAP[categoryId];
  const [form, setForm] = useState(() => buildInitialForm(category, record));
  const formRef = useRef(form);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextForm = buildInitialForm(category, record);
    formRef.current = nextForm;
    setForm(nextForm);
  }, [category, record]);

  const dutchPay = categoryId === 'dining' ? calcDutchPay(form) : null;
  const investment = categoryId === 'investment' ? calcInvestment(form) : null;
  const hospitalNet = categoryId === 'hospital' ? Math.max(0, toNumber(form.medicalCost) - toNumber(form.insuranceRefund)) : 0;

  function applyDerivedValues(next, fieldId) {
    if (categoryId === 'delivery' && (fieldId === 'menuItems' || fieldId === 'deliveryFee')) {
      next.totalAmount = String(toNumber(next.menuItems) + toNumber(next.deliveryFee));
    }
    if (categoryId === 'salary' && (fieldId === 'grossAmount' || fieldId === 'tax') && !toNumber(next.netAmount)) {
      next.netAmount = String(Math.max(0, toNumber(next.grossAmount) - toNumber(next.tax)));
    }
    if (categoryId === 'overseasTravel' && ['airfare', 'lodgingCost', 'localExpenses'].includes(fieldId)) {
      next.krwAmount = String(toNumber(next.airfare) + toNumber(next.lodgingCost) + toNumber(next.localExpenses));
    }
    if (categoryId === 'hospital' && ['medicalCost', 'insuranceRefund'].includes(fieldId)) {
      next.netMedicalCost = String(Math.max(0, toNumber(next.medicalCost) - toNumber(next.insuranceRefund)));
    }
    if (categoryId === 'investment' && ['avgBuyPrice', 'quantity', 'currentPrice', 'buyAmount', 'currentAmount'].includes(fieldId)) {
      const buyAmount = toNumber(next.avgBuyPrice) * toNumber(next.quantity);
      const currentAmount = toNumber(next.currentPrice) * toNumber(next.quantity);
      next.buyAmount = buyAmount > 0 ? String(buyAmount) : next.buyAmount || '';
      next.currentAmount = currentAmount > 0 ? String(currentAmount) : next.currentAmount || '';
      next.profitLoss = String(toNumber(next.currentAmount) - toNumber(next.buyAmount));
      next.profitLossRate = toNumber(next.buyAmount) > 0 ? String(((toNumber(next.currentAmount) - toNumber(next.buyAmount)) / toNumber(next.buyAmount)) * 100) : '';
    }
    return next;
  }

  function setField(fieldId, value) {
    setForm((current) => {
      const next = applyDerivedValues({ ...current, [fieldId]: value }, fieldId);
      formRef.current = next;
      return next;
    });
  }

  function setFieldDraft(fieldId, value) {
    formRef.current = applyDerivedValues({ ...formRef.current, [fieldId]: value }, fieldId);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const missing = category.fields.find((field) => field.required && !formRef.current[field.id]);
    if (missing) {
      setError(`${missing.label} 항목을 입력해주세요.`);
      return;
    }

    setSaving(true);
    onClose();
    try {
      await onSave(categoryId, formRef.current, record);
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
                <FieldInput
                  field={field}
                  value={field.type === 'dateRange' ? { start: form[field.startId] || form[field.id]?.start || '', end: form[field.endId] || form[field.id]?.end || '' } : form[field.id]}
                  onChange={(value) => {
                    if (field.type === 'dateRange') {
                      setField(field.id, value);
                      setField(field.startId, value.start || '');
                      setField(field.endId, value.end || '');
                      return;
                    }
                    setField(field.id, value);
                  }}
                  onDraftChange={(value) => setFieldDraft(field.id, value)}
                />
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
          <aside className={`calc-box investment-mood ${investment.profit > 0 ? 'is-positive' : investment.profit < 0 ? 'is-negative' : 'is-neutral'}`}>
            <span>투자 계산</span>
            <strong className={investment.profit >= 0 ? 'profit-plus' : 'profit-minus'}>
              {investment.rate.toFixed(2)}% · {formatMoney(investment.profit)}
            </strong>
          </aside>
        )}

        {categoryId === 'hospital' && toNumber(form.medicalCost) > 0 && (
          <aside className="calc-box hospital-calc">
            <span>실제 부담</span>
            <strong>{formatMoney(hospitalNet)}</strong>
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
